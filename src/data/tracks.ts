/**
 * 이동 기록(구글 타임라인)의 점 저장소. 브라우저 DB `tracks` 저장소에 UTC 날짜별 배열로 두고, 요약(범위·점 수·넣은 시각)은 `meta` 저장소에 둔다.
 *
 * 날짜별로 나누는 이유: 매칭(lib/tracklog/match.ts)은 촬영 시각 ±30분만 보므로 촬영일 ±1일 세 키만 읽으면 된다 — 2만 점을 매번 꺼내지 않는다.
 * 백업(ZIP)에 넣지 않는다 — 다시 내보내면 되는 자료이고 기록보다 훨씬 민감하다 (몇 달치 이동 경로다). 서버로도 보내지 않고, 좌표를 로그에 찍지 않는다.
 * 다시 넣으면 있던 점과 합친다 (중복은 points.ts의 pointKey로 거른다) — 3개월마다 넣어 가며 범위가 길어진다.
 */
// 확장자를 적는 이유: node --test가 이 파일을 직접 읽는다 (Vite는 어느 쪽이든 된다)
import { dbGet, dbWriteAll } from './db.ts'
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
const DAY_MS = 86_400_000

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

/** 새 점의 범위와 이전 요약을 합친 요약. 범위는 둘의 합집합, 점 수는 이전 수 + 실제로 새로 든 수 */
function nextMeta(prev: TracksMeta | null, range: { start: number; end: number }, added: number, now: Date): TracksMeta {
  const start = prev ? Math.min(range.start, Date.parse(prev.rangeStart)) : range.start
  const end = prev ? Math.max(range.end, Date.parse(prev.rangeEnd)) : range.end
  return {
    v: 1,
    rangeStart: new Date(start).toISOString(),
    rangeEnd: new Date(end).toISOString(),
    count: (prev?.count ?? 0) + added,
    importedAt: now.toISOString(),
  }
}

/**
 * 점들을 저장소에 합쳐 넣고 요약을 갱신한다. 날마다 있던 점을 읽어 합친다(중복 제거·정렬).
 * `onProgress(done, total)`은 날짜 하나를 합칠 때마다 부른다 (total = 날짜 수).
 * **쓰기는 날짜별 점과 요약을 트랜잭션 하나로 한다** — 다 들어가거나 하나도 안 들어간다. 날짜마다 따로 쓰면 첫 넣기 도중
 * 탭이 닫혔을 때 점만 남고 요약이 없어, 설정 화면에 '지우기'가 안 보이는(요약이 있어야 그린다) 민감한 자료가 남는다.
 * 점이 0개면 던진다 — 부르는 쪽에서 이미 걸렀겠지만 요약(범위)을 망가뜨리지 않게. DB 오류도 던진다 (그때는 아무것도 바뀌지 않는다).
 */
export async function mergeTracks(
  points: TrackPoint[],
  onProgress?: (done: number, total: number) => void,
  now = new Date(),
): Promise<{ added: number; meta: TracksMeta }> {
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
  const meta = nextMeta(prev, range, added, now)
  await dbWriteAll(['tracks', 'meta'], (store) => {
    for (const [day, rows] of days) store('tracks').put(rows, day)
    store('meta').put(meta, TRACKS_META_KEY)
  })
  return { added, meta }
}

/**
 * 이동 기록을 전부 지운다 (점과 요약 모두, 트랜잭션 하나로 — 요약만 남으면 없는 기록을 있다고 말하고, 점만 남으면 지울 길이 없다).
 * 없어도 성공한다. DB 오류는 던진다 (그때는 아무것도 지워지지 않았다).
 */
export async function clearTracks(): Promise<void> {
  await dbWriteAll(['tracks', 'meta'], (store) => {
    store('tracks').clear()
    store('meta').delete(TRACKS_META_KEY)
  })
}
