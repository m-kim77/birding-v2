/**
 * 드라이브 동기화의 규칙 — 올릴 일 줄의 항목을 어떻게 바꾸고, 드라이브와 기기 중 무엇을 받고 무엇을 올릴지, 로그인한 계정으로 이어 가도 되는지 정한다.
 * 순수 함수다 (DOM·IndexedDB·네트워크 없음, node --test가 직접 읽는다). 실제로 올리고 받는 일은 sync.ts가 한다.
 *
 * 드라이브의 모양 (보이는 폴더 — 숨김 폴더는 사용자가 "앱 데이터 삭제"로 통째로 날릴 수 있다):
 *   탐조일지 동기화/records/<기록id>.json   기록 하나 (꼬리표 appProperties.updatedAt, 지운 기록은 deleted='1', 살아 있으면 '0')
 *   탐조일지 동기화/photos/<기록id>.<판>.jpg 사진 한 판
 * 원본은 기기다. 드라이브는 사본이라, 어느 쪽이 이기는지는 백업 불러오기와 같다: **updatedAt이 더 늦은 쪽**.
 */
import type { Sighting } from '../types'

export const ROOT_FOLDER = '탐조일지 동기화'
export const RECORDS_FOLDER = 'records'
export const PHOTOS_FOLDER = 'photos'

/** 올릴 일 줄의 항목 하나. 키는 기록 id라 한 기록에 항목은 하나뿐이다 — 나중 일이 앞 일을 덮는다 */
export interface QueueEntry {
  id: string
  /** put = 기록(과 사진)을 올린다, delete = 드라이브에서 지우고 "지웠음" 표시를 남긴다 */
  op: 'put' | 'delete'
  /** 사진도 다시 올릴지. 이름·메모만 고친 기록은 사진을 다시 올리지 않는다 (드라이브에 없는 판은 이와 무관하게 올린다) */
  photos: boolean
  /** 줄에 넣은 시각 (UTC ISO). 올리는 도중 새 일이 들어왔는지 가리는 표지이자, delete의 "지운 시각" */
  at: string
  /** 실패한 횟수 */
  tries: number
  /** 이 시각 전에는 자동으로 다시 하지 않는다 (UTC ISO) */
  nextAt: string
  /** 자동 재시도를 멈췄다 — 사용자가 "지금 올리기"를 누르면 다시 한다 */
  stuck: boolean
  /** 마지막 실패의 이유 (화면에 보인다) */
  lastError?: string
}

/** 자동으로 다시 하는 간격 (실패 1번째 뒤 30초, 2번째 뒤 2분 …). 이 수만큼 실패하면 멈춘다 — 무한히 돌지 않는다 */
const BACKOFF_SECONDS = [30, 120, 600, 1800, 3600]
export const MAX_TRIES = BACKOFF_SECONDS.length

/**
 * 기록에 일이 생겼을 때 줄의 항목을 만든다. 앞 항목이 있으면 덮되, 앞 항목이 사진을 올려야 했으면 그것을 잃지 않는다.
 * 새 일이 들어오면 실패 횟수를 지우고 곧바로 하게 한다 (사용자가 새로 고쳤다 = 다시 해 볼 이유가 생겼다).
 */
export function queueChange(prev: QueueEntry | undefined, id: string, op: QueueEntry['op'], photos: boolean, now: Date): QueueEntry {
  const keepPhotos = op === 'put' && (photos || (prev?.op === 'put' && prev.photos))
  return { id, op, photos: keepPhotos, at: now.toISOString(), tries: 0, nextAt: now.toISOString(), stuck: false }
}

/** 한 번 실패한 뒤의 항목. 횟수를 올리고 다음 시각을 뒤로 민다. 상한에 닿으면 멈춤 표시 */
export function afterFailure(entry: QueueEntry, message: string, now: Date): QueueEntry {
  const tries = entry.tries + 1
  const wait = BACKOFF_SECONDS[Math.min(tries, BACKOFF_SECONDS.length) - 1]
  return { ...entry, tries, nextAt: new Date(now.getTime() + wait * 1000).toISOString(), stuck: tries >= MAX_TRIES, lastError: message }
}

/**
 * 지금 할 항목. 사용자가 누른 것(manual)이면 멈춘 것까지 전부, 자동이면 멈추지 않았고 때가 된 것만.
 * 순서는 줄에 넣은 순 — 먼저 생긴 일부터 올린다.
 */
export function dueEntries(entries: QueueEntry[], now: Date, manual: boolean): QueueEntry[] {
  const at = now.toISOString()
  return entries.filter((e) => manual || (!e.stuck && e.nextAt <= at)).sort((a, b) => a.at.localeCompare(b.at))
}

/** 드라이브에 있는 기록 파일 하나를 목록의 꼬리표로 읽은 것 (내용을 받지 않고도 받을지 정할 수 있다) */
export interface RemoteRecord {
  id: string
  fileId: string
  updatedAt: string
  deleted: boolean
}

/** 기록 파일의 이름 */
export function recordFileName(id: string): string {
  return `${id}.json`
}

/** 사진 파일의 이름 (백업 ZIP의 사진 이름과 같은 모양) */
export function photoFileName(id: string, kind: string): string {
  return `${id}.${kind}.jpg`
}

/**
 * 드라이브 목록의 파일 하나를 기록 꼬리표로 읽는다. 이름·꼬리표가 우리 모양이 아니면 null (사람이 넣은 파일 등).
 * deleted는 '1'만 지움이다 — '0'과, 그 꼬리표가 없던 옛 파일은 살아 있는 기록.
 */
export function remoteRecordOf(file: { id: string; name: string; appProperties?: Record<string, string> }): RemoteRecord | null {
  const m = /^(.+)\.json$/.exec(file.name)
  const updatedAt = file.appProperties?.updatedAt
  if (!m || !updatedAt) return null
  return { id: m[1], fileId: file.id, updatedAt, deleted: file.appProperties?.deleted === '1' }
}

/**
 * 드라이브 기록 파일의 꼬리표. 지우지 않은 기록에도 deleted를 '0'으로 적는다.
 * PATCH는 안 보낸 꼬리표를 남긴다 — 다른 기기에서 지운('1') 기록을 여기서 고쳐 다시 올릴 때 '0'으로 덮지 않으면,
 * 다음 동기화가 고친 기록을 지운 기록으로 읽어 기기에서 지운다. 읽는 쪽(`remoteRecordOf`)은 '1'만 지움으로 본다.
 * 거꾸로 '0'이 더 늦은 지움을 덮으면 안 된다 — 지움보다 먼저 고친 기록은 올리기 전에 `planPull`이 기기에서 지운다.
 */
export function recordTags(updatedAt: string, deleted: boolean): Record<string, string> {
  return { updatedAt, deleted: deleted ? '1' : '0' }
}

export interface PullPlan {
  /** 드라이브 쪽이 더 새것이거나 기기에 없는 기록 — 받아서 기기에 쓴다 */
  download: RemoteRecord[]
  /** 다른 기기에서 지웠고, 그 뒤로 이 기기에서 고친 적이 없는 기록 — 기기에서도 지운다 (줄에 올릴 일이 남았어도) */
  removeLocal: string[]
  /** 기기 쪽이 더 새것이거나 드라이브에 없는 기록 — 줄에 넣어 올린다 (드라이브에 없는 사진 판도 함께 — 있는 판은 다시 올리지 않는다) */
  upload: string[]
}

/**
 * 드라이브와 기기를 견줘 할 일을 정한다. 같은 id는 updatedAt이 더 늦은 쪽이 이긴다 (같으면 그대로 둔다).
 * - 줄에 올릴 일이 남은 기록(`pending`)은 건드리지 않는다 — 기기 쪽 일이 아직 드라이브에 닿지 않았을 뿐이다.
 *   (특히 지운 기록: 지움이 올라가기 전에 받으면 지운 기록이 되살아난다.)
 * - 지움 표시는 그 뒤에 기기에서 고친 기록을 지우지 않는다 — 고친 쪽이 더 늦으니 다시 올린다.
 * - 거꾸로 지움이 기기의 고침보다 늦으면(또는 같으면) 줄에 일이 남았어도 기기에서 지운다. 그 고침을 올리면
 *   꼬리표 deleted='0'(`recordTags`)이 드라이브의 지움을 덮어, 지운 기록이 모든 기기에 되살아난다.
 *   줄의 그 올리기 항목은 기록과 함께 지운다 (photos.ts `deletePulledSighting` — 지우기 직전에 더 늦은 고침이 생겼으면 둘 다 남긴다).
 */
export function planPull(local: Sighting[], remote: RemoteRecord[], pending: Set<string>): PullPlan {
  const mine = new Map(local.map((s) => [s.id, s]))
  const plan: PullPlan = { download: [], removeLocal: [], upload: [] }
  const seen = new Set<string>()
  for (const r of remote) {
    seen.add(r.id)
    const l = mine.get(r.id)
    if (r.deleted && l && l.updatedAt <= r.updatedAt) { plan.removeLocal.push(r.id); continue }
    if (pending.has(r.id)) continue
    if (r.deleted) {
      if (l) plan.upload.push(r.id)
    } else if (!l || l.updatedAt < r.updatedAt) plan.download.push(r)
    else if (l.updatedAt > r.updatedAt) plan.upload.push(r.id)
  }
  for (const s of local) if (!seen.has(s.id) && !pending.has(s.id)) plan.upload.push(s.id)
  return plan
}

/**
 * 줄의 올리기 항목을 드라이브에 올려도 되는지 — 드라이브의 판이 기기 판보다 **더 새것**이면 올리지 않는다.
 * 줄에 남은 옛 고침(오프라인이던 폰의 10:00)이 다른 기기가 그 뒤에 올린 판(PC의 12:00)을 덮으면 '늦은 쪽이 이긴다'와 반대가 되고,
 * 그 전에 PC의 자료가 지워지면 PC의 고침은 영영 사라진다. 올리지 않은 항목은 끝난 것으로 빼고, 다음 받기가 드라이브의 판을 따른다
 * (줄에 없으니 `planPull`이 받거나, 지움 표시면 기기에서 지운다). 드라이브에 없으면 올린다.
 * 같은 시각은 `planPull`과 같게 가른다: 살아 있는 기록이면 올리고(같은 판을 다시 올릴 뿐), 지움 표시면 지움이 이긴다.
 */
export function shouldPushRecord(local: Pick<Sighting, 'updatedAt'>, remote: RemoteRecord | undefined): boolean {
  if (!remote) return true
  return remote.deleted ? local.updatedAt > remote.updatedAt : local.updatedAt >= remote.updatedAt
}

/**
 * 로그인한 구글 계정의 표지(`current`, 드라이브 permissionId)를 이 기기가 동기화해 온 계정의 표지(`saved`, `meta`)와 견준다.
 * - adopt: 적어 둔 표지가 없다 (처음 연결, 또는 이 확인이 생기기 전부터 연결해 둔 기기) — 지금 계정을 적고 동기화한다.
 * - same: 같은 계정 — 그대로 동기화한다.
 * - ask: 다른 계정 — 기록을 주고받기 **전에** 멈추고 사용자에게 묻는다. 묻지 않고 돌면 이 기기의 기록·사진이 그 계정의 드라이브에 사본으로 남고
 *   그 계정의 기록은 이 기기 일지에 섞인다.
 * 적어 둔 값이 글자가 아니거나 비었으면 없는 것으로 본다. `current`는 비지 않은 글자여야 한다 (driveApi.ts accountId가 빈 번호를 거른다).
 */
export function accountDecision(saved: unknown, current: string): 'adopt' | 'same' | 'ask' {
  if (typeof saved !== 'string' || saved === '') return 'adopt'
  return saved === current ? 'same' : 'ask'
}

/** 다른 계정이라 묻는 중일 때 `meta`에 적어 두는 값 (data/syncAccount.ts) */
export interface AskedAccount {
  /** 묻는 새 계정의 표지 (드라이브 permissionId) */
  id: string
  /** 묻는 단계가 이동 기록 올리기를 껐는지 (켜져 있었다) — '합치지 않고 연결 끊기'의 결과 줄이 알린다 */
  tracksWasOn: boolean
}

/**
 * `meta`의 묻는 중 값을 읽는다. 표지가 없거나 비었으면 null (묻는 중이 아니다).
 * 옛 모양(표지 글자만 — 이동 기록 스위치를 적기 전)도 읽는다: 스위치는 켜져 있지 않았던 것으로 본다.
 */
export function askedAccountOf(value: unknown): AskedAccount | null {
  if (typeof value === 'string') return value === '' ? null : { id: value, tracksWasOn: false }
  if (typeof value !== 'object' || value === null) return null
  const { id, tracksWasOn } = value as { id?: unknown; tracksWasOn?: unknown }
  if (typeof id !== 'string' || id === '') return null
  return { id, tracksWasOn: tracksWasOn === true }
}
