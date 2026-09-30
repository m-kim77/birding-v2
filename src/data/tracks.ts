/**
 * 이동 기록(구글 타임라인)의 점 저장소. 브라우저 DB `tracks` 저장소에 UTC 날짜별 배열로 두고, 요약(범위·점 수·넣은 시각)은 `meta` 저장소에 둔다.
 *
 * 날짜별로 나누는 이유: 매칭(lib/tracklog/match.ts)은 촬영 시각 ±30분만 보므로 촬영일 ±1일 세 키만 읽으면 된다 — 2만 점을 매번 꺼내지 않는다.
 * 백업(ZIP)에 넣지 않는다 — 다시 내보내면 되는 자료이고 기록보다 훨씬 민감하다 (몇 달치 이동 경로다). 이 사이트의 서버로 보내지 않고, 좌표를 로그에 찍지 않는다.
 * 기기 밖으로 나가는 길은 하나뿐이다: 사용자가 이 기기에서 '이동 기록도 구글 드라이브에 올리기'를 켰을 때만 골라 둔 점이 **자기 드라이브로**
 * 곧장 간다 (data/syncTracks.ts — 기본은 꺼짐, 스위치는 `meta`의 TRACKS_SYNC_ON_KEY).
 * 다시 넣으면 있던 점과 합친다 (중복은 points.ts의 pointKey로 거른다) — 3개월마다 넣어 가며 범위가 길어진다. 드라이브에서 받은 점도 같은 규칙으로 합친다.
 */
// 확장자를 적는 이유: node --test가 이 파일을 직접 읽는다 (Vite는 어느 쪽이든 된다)
import { dbGet, dbGetAll, dbWriteAll, type StoreName } from './db.ts'
// 확장자를 적는 이유: 위와 같다
import { comparePoints, dayKeyOf, groupByDay, mergeSorted, pack, rangeOf, unpack, type PackedPoint, type TrackPoint } from '../lib/tracklog/points.ts'

/** 이동 기록 요약. 설정 카드(범위·점 수·넣은 날), 매칭 실패 안내(범위 밖인지), 60일 알림이 쓴다 */
export interface TracksMeta {
  v: 1
  /** 저장된 점 가운데 가장 이른 시각, UTC ISO */
  rangeStart: string
  /** 저장된 점 가운데 가장 늦은 시각, UTC ISO */
  rangeEnd: string
  /** 저장된 점 전체 수 (중복을 거른 뒤) */
  count: number
  /** 마지막으로 넣은 시각, UTC ISO. "넣은 날"과 60일 알림의 기준 */
  importedAt: string
}

/** `meta` 저장소에서 요약이 놓인 키 */
export const TRACKS_META_KEY = 'tracks'
/**
 * `meta` 저장소의 '이동 기록도 구글 드라이브에 올리기' 스위치 (true만 켜짐 — 없으면 꺼짐). 기기마다 따로다.
 * 이 파일에 두는 이유: 기기의 이동 기록을 지울 때 **같은 트랜잭션에서** 끈다 (clearTracks) — 안 끄면 다음 동기화가 드라이브에서 도로 받아 온다.
 */
export const TRACKS_SYNC_ON_KEY = 'tracksSyncOn'
const DAY_MS = 86_400_000

/** 이동 기록 저장소를 바꾸는 일의 차례 (inTurn). 앞 일이 끝난 뒤(실패해도) 다음 일을 한다 */
let turn: Promise<unknown> = Promise.resolve()

/**
 * 저장소를 바꾸는 일(합치기·지우기)을 하나씩 차례로 한다. 합치기는 날마다 있던 점을 **읽은 뒤에** 쓰므로, 파일 넣기와
 * 드라이브에서 받은 합치기가 겹치면 나중에 쓰는 쪽이 앞의 점을 덮어 잃는다. 한 탭 안에서만 지킨다 (탭 둘에서 동시에 넣는 것은 전과 같다).
 * 일의 결과와 실패는 그대로 돌려준다.
 */
function inTurn<T>(job: () => Promise<T>): Promise<T> {
  const p = turn.then(job)
  turn = p.catch(() => {})
  return p
}

/** UTC ISO 문자열로 읽히는지 */
function isIsoDate(v: unknown): v is string {
  return typeof v === 'string' && Number.isFinite(Date.parse(v))
}

/**
 * DB에서 읽은 값이 요약 모양인지. 앱을 고치다가 옛 모양이 남을 수 있어 믿지 않는다.
 * 시각 세 개는 Date.parse가 되는지까지 본다 — 화면과 범위 판정이 그대로 parse해 쓴다.
 */
export function isTracksMeta(v: unknown): v is TracksMeta {
  const m = v as Record<string, unknown> | null
  if (!m || typeof m !== 'object' || m.v !== 1) return false
  if (!isIsoDate(m.rangeStart) || !isIsoDate(m.rangeEnd) || !isIsoDate(m.importedAt)) return false
  return typeof m.count === 'number' && Number.isFinite(m.count) && m.count >= 0
}

/** 요약을 읽는다. 없거나 모양이 틀리거나 DB를 못 열면 null (던지지 않는다 — 편의 기능이라 기록 작성을 막지 않는다) */
export async function readTracksMeta(): Promise<TracksMeta | null> {
  try {
    const v = await dbGet<unknown>('meta', TRACKS_META_KEY)
    return isTracksMeta(v) ? v : null
  } catch {
    return null
  }
}

/** 하루치 점을 읽는다. 그날 키가 없으면 빈 배열. DB 오류는 던진다 */
async function readDay(day: string): Promise<TrackPoint[]> {
  const rows = await dbGet<PackedPoint[]>('tracks', day)
  return (rows ?? []).map(unpack)
}

/**
 * 촬영 시각 앞뒤 하루씩, UTC 날짜 세 키의 점을 읽어 이어 붙인다 (매칭 윈도우 30분이 날짜 경계를 넘어도 빠지지 않게).
 * 결과는 `comparePoints` 순 — 매칭(match.ts)이 정렬을 전제한다. DB 오류는 던진다.
 */
export async function readPointsAround(tMs: number): Promise<TrackPoint[]> {
  const days = [dayKeyOf(tMs - DAY_MS), dayKeyOf(tMs), dayKeyOf(tMs + DAY_MS)]
  const lists = await Promise.all(days.map(readDay))
  // 날마다 이미 정렬돼 있고 날짜 키가 오름차순이라 이어 붙인 것도 정렬돼 있지만, 전제를 저장 형식에 기대지 않고 한 번 더 — 수백 점이라 싸다
  return lists.flat().sort(comparePoints)
}

/**
 * 저장된 점 전부 (`comparePoints` 순). 드라이브 동기화가 달마다 지문을 만들 때 쓴다 — 2만 점이어도 1MB 안쪽이라 한 번에 읽는다.
 * 저장소가 비었으면 빈 배열, 배열이 아닌 값이 끼어 있으면 그 키만 건너뛴다. DB 오류는 던진다.
 */
export async function readAllPoints(): Promise<TrackPoint[]> {
  const days = await dbGetAll<unknown>('tracks')
  return days.flatMap((rows) => (Array.isArray(rows) ? (rows as PackedPoint[]) : [])).map(unpack).sort(comparePoints)
}

/**
 * 넣은 날: 이전 값과 새 값 중 **더 늦은 쪽**. 같으면 이전 문자열을 그대로 둔다 — 60일 알림의 "닫은 기억"이 이 문자열과 견준다(refreshNudge.ts).
 * 새 값이 Invalid Date면 이전 값을, 둘 다 못 쓰면 지금을 준다 (toISOString의 RangeError로 넣기 전체가 실패하지 않게).
 */
function laterImportedAt(prev: string | undefined, next: Date): string {
  const before = prev === undefined ? NaN : Date.parse(prev)
  if (Number.isFinite(before) && !(next.getTime() > before)) return prev!
  return Number.isFinite(next.getTime()) ? next.toISOString() : new Date().toISOString()
}

/**
 * 새 점의 범위와 이전 요약을 합친 요약. 범위는 둘의 합집합, 점 수는 이전 수 + 실제로 새로 든 수.
 * 넣은 날은 이전 값과 `importedAt` 중 더 늦은 쪽이다 — 드라이브에서 받은 점은 올린 기기가 넣은 시각을 들고 오는데, 받은 순간(지금)으로
 * 바꾸면 60일 알림이 미뤄져 그사이 구글이 3개월 지난 타임라인을 지운다. 파일을 직접 넣을 때는 `importedAt`이 지금이라 전과 같다.
 */
export function nextMeta(prev: TracksMeta | null, range: { start: number; end: number }, added: number, importedAt: Date): TracksMeta {
  const start = prev ? Math.min(range.start, Date.parse(prev.rangeStart)) : range.start
  const end = prev ? Math.max(range.end, Date.parse(prev.rangeEnd)) : range.end
  return {
    v: 1,
    rangeStart: new Date(start).toISOString(),
    rangeEnd: new Date(end).toISOString(),
    count: (prev?.count ?? 0) + added,
    importedAt: laterImportedAt(prev?.importedAt, importedAt),
  }
}

/** 합칠 준비: 이전 요약과 날마다 합친 점을 읽어 둔다 (쓰기 전). 점이 0개면 던진다. DB 오류도 던진다 */
async function prepareMerge(
  points: TrackPoint[],
  onProgress: ((done: number, total: number) => void) | undefined,
  importedAt: Date,
): Promise<{ days: Array<[string, PackedPoint[]]>; added: number; meta: TracksMeta }> {
  const range = rangeOf(points)
  if (!range) throw new Error('넣을 점이 없습니다.')
  // 이전 요약은 DB 오류를 삼키지 않고 읽는다 (readTracksMeta는 삼킨다) — 못 읽은 것을 "처음 넣기"로 알면 점 수·범위가 틀어진다
  const stored = await dbGet<unknown>('meta', TRACKS_META_KEY)
  const prev = isTracksMeta(stored) ? stored : null
  const groups = groupByDay(points)
  const days: Array<[string, PackedPoint[]]> = []
  let added = 0
  for (const [day, incoming] of groups) {
    const merged = mergeSorted(await readDay(day), incoming)
    days.push([day, merged.points.map(pack)])
    added += merged.added
    onProgress?.(days.length, groups.size)
  }
  return { days, added, meta: nextMeta(prev, range, added, importedAt) }
}

/** 합친 날짜별 점과 요약을 쓰기 요청으로 만든다 (dbWriteAll 안에서 — 기다리지 않는다) */
function putMerged(store: (name: StoreName) => IDBObjectStore, days: Array<[string, PackedPoint[]]>, meta: TracksMeta): void {
  for (const [day, rows] of days) store('tracks').put(rows, day)
  store('meta').put(meta, TRACKS_META_KEY)
}

/**
 * 점들을 저장소에 합쳐 넣고 요약을 갱신한다. 날마다 있던 점을 읽어 합친다(중복 제거·정렬).
 * `onProgress(done, total)`은 날짜 하나를 합칠 때마다 부른다 (total = 날짜 수).
 * `importedAt`은 이 점들을 넣은 시각 — 파일을 넣을 때는 지금(기본값). 요약의 넣은 날은 이전 값과 견줘 더 늦은 쪽이 된다 (nextMeta).
 * **쓰기는 날짜별 점과 요약을 트랜잭션 하나로 한다** — 다 들어가거나 하나도 안 들어간다. 날짜마다 따로 쓰면 첫 넣기 도중
 * 탭이 닫혔을 때 점만 남고 요약이 없어, 설정 화면에 '지우기'가 안 보이는(요약이 있어야 그린다) 민감한 자료가 남는다.
 * 저장소를 바꾸는 다른 일(드라이브에서 받은 합치기·지우기)과 겹치지 않게 차례를 기다린다 (inTurn).
 * 점이 0개면 던진다 — 부르는 쪽에서 이미 걸렀겠지만 요약(범위)을 망가뜨리지 않게. DB 오류도 던진다 (그때는 아무것도 바뀌지 않는다).
 */
export function mergeTracks(
  points: TrackPoint[],
  onProgress?: (done: number, total: number) => void,
  importedAt = new Date(),
): Promise<{ added: number; meta: TracksMeta }> {
  return inTurn(async () => {
    const { days, added, meta } = await prepareMerge(points, onProgress, importedAt)
    await dbWriteAll(['tracks', 'meta'], (store) => putMerged(store, days, meta))
    return { added, meta }
  })
}

/**
 * 드라이브에서 받은 점을 합친다 (data/syncTracks.ts). 새로 든 점 수를 준다.
 * `importedAt`은 그 점을 올린 기기의 넣은 날 — 요약의 넣은 날은 더 늦은 쪽이 된다 (받았다고 지금으로 바꾸지 않는다, nextMeta).
 * **쓰는 트랜잭션 안에서 스위치를 다시 본다** — 받는 사이 사용자가 스위치를 껐거나 이 기기의 이동 기록을 지웠으면(clearTracks가 스위치도 끈다)
 * 아무것도 쓰지 않고 0을 준다. 안 보면 방금 지운 점이 드라이브에서 도로 들어온다. 새로 든 점이 없어도 쓰지 않는다.
 * 점이 0개면 던진다. DB 오류도 던진다.
 */
export function mergeReceivedTracks(points: TrackPoint[], importedAt: Date): Promise<number> {
  return inTurn(async () => {
    const { days, added, meta } = await prepareMerge(points, undefined, importedAt)
    if (added === 0) return 0
    let wrote = false
    await dbWriteAll(['tracks', 'meta'], (store) => {
      const on = store('meta').get(TRACKS_SYNC_ON_KEY)
      // 같은 트랜잭션 안에서 읽은 뒤 쓴다 (요청 콜백 안의 요청은 트랜잭션을 이어 간다)
      on.onsuccess = () => { if (on.result === true) { putMerged(store, days, meta); wrote = true } }
    })
    return wrote ? added : 0
  })
}

/**
 * 이 기기의 이동 기록을 전부 지운다 (점과 요약 모두, 트랜잭션 하나로 — 요약만 남으면 없는 기록을 있다고 말하고, 점만 남으면 지울 길이 없다).
 * **같은 트랜잭션에서 드라이브 올리기 스위치도 끈다** — 켜 둔 채면 다음 동기화가 드라이브의 사본을 도로 받아 온다.
 * 드라이브의 사본과 다른 기기의 점은 건드리지 않는다 (드라이브 사본은 syncTracks.ts clearDriveTracks가 따로 지운다).
 * 없어도 성공한다. DB 오류는 던진다 (그때는 아무것도 지워지지 않았다).
 */
export function clearTracks(): Promise<void> {
  return inTurn(() => dbWriteAll(['tracks', 'meta'], (store) => {
    store('tracks').clear()
    store('meta').delete(TRACKS_META_KEY)
    store('meta').delete(TRACKS_SYNC_ON_KEY)
  }))
}
