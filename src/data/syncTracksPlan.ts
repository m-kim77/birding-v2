/**
 * 이동 기록 드라이브 동기화의 규칙 — 드라이브에 둘 파일의 모양, 두 기기의 점을 합칠 때 무엇을 받고 무엇을 올릴지.
 * 순수 함수다 (DOM·IndexedDB·네트워크 없음, node --test가 직접 읽는다). 실제로 주고받는 일은 syncTracks.ts가 한다.
 *
 * 드라이브의 모양 (기록과 같은 보이는 폴더 아래, 스위치를 켠 기기만 만든다):
 *   탐조일지 동기화/tracks/<YYYY-MM>.json  UTC 달 하나의 골라 둔 점 — { v: 1, month, points: PackedPoint[] }. 타임라인 원본 파일이 아니다.
 *     꼬리표 digest(그 달 점의 지문) · count(점 수) · importedAt(올린 기기의 '넣은 날'). 좌표는 꼬리표·파일 이름에 넣지 않는다
 *   탐조일지 동기화/tracks/cleared.json   "드라이브의 이동 기록을 지웠음" 표시 (꼬리표 clearedAt)
 * 합치기는 점의 합집합이다 (파일을 다시 넣을 때와 같은 points.ts mergeSorted) — 점은 늘기만 해서 어느 순서로 합쳐도 같은 결과가 된다.
 * 받을지·올릴지는 달마다 지문을 견줘 정한다. 지문은 pointKey(t|source|lat|lng)만으로 만든다 — 정확도를 넣으면
 * 같은 점의 정확도가 기기마다 다를 때 두 기기가 끝없이 서로 덮어쓴다 (mergeSorted는 먼저 있던 쪽의 정확도를 남긴다).
 */
// 확장자를 적는 이유: node --test가 이 파일을 직접 읽는다 (Vite는 어느 쪽이든 된다)
import { comparePoints, pack, pointKey, type TrackPoint } from '../lib/tracklog/points.ts'

export const TRACKS_FOLDER = 'tracks'
export const CLEARED_FILE = 'cleared.json'
/** 달 파일의 이름 모양 — 'YYYY-MM.json' */
const MONTH_FILE = /^(\d{4}-(?:0[1-9]|1[0-2]))\.json$/
/** Date가 나타낼 수 있는 가장 먼 시각(ms). 넘으면 toISOString이 RangeError를 던진다 */
const MAX_TIME = 8.64e15
/** 달의 모양 'YYYY-MM' — 0000~9999년 밖의 시각은 '+010000-01'처럼 되어 달 파일 이름(MONTH_FILE)으로 다시 읽히지 않는다 */
const MONTH_KEY = /^\d{4}-(?:0[1-9]|1[0-2])$/

/** 드라이브 목록의 파일 하나 — 이 파일이 쓰는 만큼만 (driveApi.ts DriveFile과 같은 모양) */
export interface TracksDriveFile {
  id: string
  name: string
  appProperties?: Record<string, string>
}

/** 드라이브에 있는 달 파일 하나를 목록의 꼬리표로 읽은 것 (내용을 받지 않고도 받을지 정한다) */
export interface RemoteMonth {
  /** 'YYYY-MM' (UTC) */
  month: string
  fileId: string
  digest: string
  count: number
  /** 올린 기기의 넣은 날 (UTC ISO). 받은 기기의 요약은 자기 것과 견줘 더 늦은 쪽을 쓴다 (tracks.ts nextMeta) */
  importedAt: string
}

/** 기기의 한 달치 점과 그 지문 */
export interface LocalMonth {
  digest: string
  points: TrackPoint[]
}

/** 달 파일 하나에 대해 할 일 (planUpload) */
export interface UploadStep {
  month: string
  /** 기기의 점으로 파일을 새로 만들거나 덮는다. false면 남는 파일만 지운다 */
  upload: boolean
  /** 덮어쓸 파일 id. 없으면 새로 만든다 */
  fileId?: string
  /** 지울 파일 id — 같은 달의 남는 파일 (두 기기가 동시에 처음 올린 경우). 올리기가 성공한 뒤에 지운다 */
  remove: string[]
}

/** 점이 속한 UTC 달 'YYYY-MM'. 시각은 isSyncablePoint가 이미 걸렀다고 본다 (Date 범위 밖의 시각이면 RangeError) */
export function monthKeyOf(t: number): string {
  return new Date(t).toISOString().slice(0, 7)
}

/** 달 파일의 이름 */
export function monthFileName(month: string): string {
  return `${month}.json`
}

/**
 * 드라이브로 주고받는 점인지 — 올릴 때(localMonthsOf)와 받을 때(decodeMonth)가 이 한 기준을 쓴다.
 * 기준이 다르면 받는 쪽이 버리는 점 때문에 두 기기의 지문이 영영 같아지지 않아, 돌 때마다 서로 덮어쓴다.
 * 시각은 0000~9999년(UTC) · source는 빈 글자가 아님 · 위도 -90~90 · 경도 -180~180 · 정확도는 null 또는 0 이상, 수는 모두 유한해야 한다.
 * 기준 밖의 점(파서가 받아들인 드문 값 — 음수 정확도 등)은 기기에는 그대로 남고 드라이브로만 가지 않는다.
 */
export function isSyncablePoint(p: TrackPoint): boolean {
  if (!Number.isFinite(p.t) || Math.abs(p.t) > MAX_TIME || !MONTH_KEY.test(monthKeyOf(p.t))) return false
  if (typeof p.source !== 'string' || !p.source) return false
  if (!Number.isFinite(p.lat) || p.lat < -90 || p.lat > 90) return false
  if (!Number.isFinite(p.lng) || p.lng < -180 || p.lng > 180) return false
  return p.accuracy === null || (Number.isFinite(p.accuracy) && p.accuracy >= 0)
}

/** UTC 달별로 묶는다. 각 묶음의 순서는 입력 순서 그대로다 */
export function groupByMonth(points: TrackPoint[]): Map<string, TrackPoint[]> {
  const groups = new Map<string, TrackPoint[]>()
  for (const p of points) {
    const key = monthKeyOf(p.t)
    const list = groups.get(key)
    if (list) list.push(p)
    else groups.set(key, [p])
  }
  return groups
}

/**
 * 점들의 지문: 겹치지 않는 pointKey를 정렬해 줄바꿈으로 이은 것의 SHA-256, 16진수 앞 32자.
 * 순서·중복·정확도가 달라도 같은 점들이면 같은 값이다. 빈 배열도 값이 있다 (빈 문자열의 지문).
 */
export async function digestOf(points: TrackPoint[]): Promise<string> {
  const keys = [...new Set(points.map(pointKey))].sort()
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(keys.join('\n'))))
  return Array.from(hash.subarray(0, 16), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** 기기의 점 가운데 주고받는 점(isSyncablePoint)만 달마다 묶고 지문을 붙인다 — 기준 밖의 점은 지문에도 올리는 파일에도 들지 않는다 */
export async function localMonthsOf(points: TrackPoint[]): Promise<Map<string, LocalMonth>> {
  const out = new Map<string, LocalMonth>()
  for (const [month, list] of groupByMonth(points.filter(isSyncablePoint))) out.set(month, { digest: await digestOf(list), points: list })
  return out
}

/** UTC ISO로 읽히는 문자열인지 */
function isIso(v: unknown): v is string {
  return typeof v === 'string' && Number.isFinite(Date.parse(v))
}

/**
 * 드라이브 목록의 파일 하나를 달 파일로 읽는다. 이름이 'YYYY-MM.json'이 아니거나 꼬리표(digest·importedAt)가 없으면 null
 * (cleared.json · 사람이 넣은 파일 등). count를 못 읽으면 0 — 화면에 쓰지 않고 판단에도 쓰지 않는다.
 */
export function remoteMonthOf(file: TracksDriveFile): RemoteMonth | null {
  const m = MONTH_FILE.exec(file.name)
  const tags = file.appProperties ?? {}
  if (!m || !tags.digest || !isIso(tags.importedAt)) return null
  const count = Number(tags.count)
  return { month: m[1], fileId: file.id, digest: tags.digest, count: Number.isFinite(count) ? count : 0, importedAt: tags.importedAt }
}

/**
 * 목록에 달 파일(remoteMonthOf로 읽히는 것)이 하나라도 있는지 — 드라이브에 이동 기록이 있다고 볼지.
 * "지웠음" 표시가 있어도 누가 지우다 끊겼으면 달 파일이 남는다 — 그때 true여야 '드라이브의 이동 기록 지우기'가 남아 다시 지울 수 있다.
 */
export function hasMonthFiles(files: TracksDriveFile[]): boolean {
  return files.some((f) => remoteMonthOf(f) !== null)
}

/** 달 파일에 달 꼬리표. 좌표는 넣지 않는다 (꼬리표는 목록에서 누구나 읽는다) */
export function monthTags(digest: string, count: number, importedAt: string): Record<string, string> {
  return { digest, count: String(count), importedAt }
}

/** 달 파일의 내용. 점은 `comparePoints` 순이라 같은 점들이면 어느 기기가 만들어도 같은 글이 된다 */
export function encodeMonth(month: string, points: TrackPoint[]): string {
  return JSON.stringify({ v: 1, month, points: [...points].sort(comparePoints).map(pack) })
}

/**
 * 받은 줄 하나를 점으로. 모양이 틀리거나(칸이 모자람·숫자 아님) 주고받는 점의 기준(isSyncablePoint — 위도/경도 범위 밖·음수 정확도 등) 밖이거나
 * 그 달이 아닌 시각이면 null.
 */
function rowToPoint(row: unknown, month: string): TrackPoint | null {
  if (!Array.isArray(row) || row.length < 5) return null
  const [t, source, lat, lng, accuracy] = row as unknown[]
  if (typeof t !== 'number' || typeof source !== 'string' || typeof lat !== 'number' || typeof lng !== 'number') return null
  if (accuracy !== null && typeof accuracy !== 'number') return null
  const p: TrackPoint = { t, source, lat, lng, accuracy }
  return isSyncablePoint(p) && monthKeyOf(t) === month ? p : null
}

/**
 * 받은 달 파일의 글을 점으로. 줄마다 검사해 틀린 줄은 건너뛴다 (나머지는 쓴다).
 * JSON이 아니거나 모양이 틀리면 빈 배열 — 깨진 파일이다 (기기의 점으로 덮어 고친다).
 * **v가 1보다 큰 파일은 null** — 앱이 나중에 파일 모양을 바꿨을 때 옛 앱이 못 읽는 새 파일을 덮어 버리지 않게 (planUpload의 keep).
 */
export function decodeMonth(text: string, month: string): TrackPoint[] | null {
  let body: unknown
  try { body = JSON.parse(text) } catch { return [] }
  if (!body || typeof body !== 'object') return []
  const { v, points } = body as { v?: unknown; points?: unknown }
  if (typeof v === 'number' && v > 1) return null
  if (v !== 1 || !Array.isArray(points)) return []
  return points.flatMap((row) => rowToPoint(row, month) ?? [])
}

/**
 * 받을 달 파일: 드라이브의 지문이 기기의 그 달 지문과 다른 파일 전부 (기기에 없는 달 포함, 같은 달 파일이 둘이면 다른 것 모두).
 * 지문이 같으면 받지 않는다 — 내용이 같다. 달 순서로 준다.
 */
export function planDownload(local: Map<string, string>, remote: RemoteMonth[]): RemoteMonth[] {
  return remote.filter((r) => local.get(r.month) !== r.digest).sort((a, b) => a.month.localeCompare(b.month))
}

/**
 * 받아 합친 **뒤의** 기기 지문으로 올릴 것을 정한다. 기기에 있는 달마다:
 * - 드라이브에 지문이 같은 파일이 하나뿐이면 할 일이 없다.
 * - 같은 파일이 있으면 그것을 남기고 나머지를 지운다. 없으면 첫 파일을 덮고(PATCH — 요청 하나라 반쪽 파일이 없다) 나머지를 지운다.
 *   나머지를 지워도 되는 것은 지문이 다른 파일은 모두 받아서 이미 합쳤기 때문이다 (planDownload).
 * - 드라이브에 없으면 새로 만든다.
 * `keep`의 달(읽지 못한 새 모양의 파일이 있는 달)은 건드리지 않는다. 드라이브에만 있는 달은 올릴 것이 없다. 달 순서로 준다.
 */
export function planUpload(local: Map<string, string>, remote: RemoteMonth[], keep: Set<string> = new Set()): UploadStep[] {
  const steps: UploadStep[] = []
  for (const month of [...local.keys()].sort()) {
    if (keep.has(month)) continue
    const digest = local.get(month)
    const files = remote.filter((r) => r.month === month)
    const same = files.find((r) => r.digest === digest)
    const target = same ?? files[0]
    const remove = files.filter((r) => r !== target).map((r) => r.fileId)
    if (same && remove.length === 0) continue
    steps.push({ month, upload: !same, fileId: target?.fileId, remove })
  }
  return steps
}

/**
 * 드라이브의 "지웠음" 표시 시각. 표시 파일이 없으면 ''. 둘 이상이면(두 기기가 동시에 지움) 글자로 가장 뒤의 값 —
 * 어느 기기가 봐도 같은 값을 고르면 된다 (시계끼리 견주는 것이 아니다).
 */
export function clearedAtOf(files: TracksDriveFile[]): string {
  let at = ''
  for (const f of files) {
    const v = f.name === CLEARED_FILE ? f.appProperties?.clearedAt : undefined
    if (v && v > at) at = v
  }
  return at
}

/**
 * 드라이브의 "지웠음" 표시를 보고 이 기기가 할 일.
 * - `adopt`: 스위치를 켠 뒤 처음 본다(`seen`이 null) — 지금 값을 본 것으로 적고 이어 간다 (알고 켠 것이다)
 * - `stop`: 켠 뒤에 누가 드라이브의 이동 기록을 지웠다 — 이 기기의 점은 두고 스위치만 끈다 (다시 올리면 지운 것이 되살아난다)
 * - `go`: 그대로 이어 간다. 표시가 없어졌을 때(사람이 드라이브에서 지움)도 새로 지운 것이 아니라 이어 간다
 * 기기 시계끼리 견주지 않고 값이 같은지만 본다.
 */
export function clearDecision(seen: string | null, clearedAt: string): 'adopt' | 'stop' | 'go' {
  if (seen === null) return 'adopt'
  return !clearedAt || clearedAt === seen ? 'go' : 'stop'
}

/** 이동 기록 단계가 실패한 뒤 자동 동기화에서 다시 돌기까지 기다리는 시간(ms) — 기록의 재시도 간격(syncPlan.ts)에도 있는 30분 */
export const TRACKS_RETRY_MS = 30 * 60_000

/** 이동 기록 단계를 이번 동기화에서 돌지 정하는 이 탭의 기억 (syncTracks.ts가 갖고 바꾼다 — 탭을 닫으면 사라진다) */
export interface TracksStepMemo {
  /** 이 탭에서 한 번이라도 끝까지 맞췄는지 — 앱을 열고 처음 도는 동기화에서 맞추려고 */
  checkedOnce: boolean
  /** 이 기기에서 이동 기록이 바뀐 횟수 (넣기·스위치 켜기) */
  changeRev: number
  /** 그중 드라이브와 끝까지 맞춘 마지막 값 — changeRev와 다르면 맞출 것이 있다 */
  syncedRev: number
  /** 마지막 실패 — 그때의 changeRev와 시각(epoch ms). 끝까지 맞추면 null */
  failed: { rev: number; at: number } | null
}

/**
 * 이번 동기화에서 이동 기록 단계를 돌지. 사용자가 누른 것(`manual` — '지금 동기화'·로그인 직후)이면 늘 돈다.
 * 자동이면: 맞춘 뒤 이 기기에서 바뀐 것이 없으면 돌지 않고, 실패한 뒤 바뀐 것이 없으면 실패하고 30분 안에는 돌지 않는다 —
 * 드라이브가 가득 찬 채면 올릴 기록이 남아 1분마다 동기화가 돌고(useAutoSync), 그때마다 2만 점을 읽고 받고 올리다 실패하기를 되풀이한다.
 * 실패한 뒤 새로 넣었거나 스위치를 다시 켰으면 곧바로 돈다. `now`가 실패 시각보다 이르면(기기 시계를 되돌림) 기다리지 않는다.
 */
export function shouldRunTracksStep(memo: TracksStepMemo, manual: boolean, now: number): boolean {
  if (manual) return true
  if (memo.checkedOnce && memo.syncedRev === memo.changeRev) return false
  const f = memo.failed
  if (!f || f.rev !== memo.changeRev) return true
  const since = now - f.at
  return since < 0 || since >= TRACKS_RETRY_MS
}
