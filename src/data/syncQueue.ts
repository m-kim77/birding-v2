/**
 * 드라이브에 올릴 일 줄 (IndexedDB `syncQueue`, 키 = 기록 id). 항목을 어떻게 바꾸는지는 syncPlan.ts의 순수 함수가 정하고,
 * 여기서는 읽고 쓰기만 한다. 줄은 드라이브를 연결했을 때만 쌓는다 (`meta`의 DRIVE_LINKED_KEY).
 * **항목은 드라이브가 "성공"이라고 답한 뒤에만 뺀다** — 도중에 끊기거나 탭이 닫혀도 줄에 남아 다음에 다시 한다.
 */
import { dbGet, dbGetAll, dbPut, dbWriteAll } from './db'
import { queueChange, type QueueEntry } from './syncPlan'

/** 드라이브를 연결했는지 (사용자가 로그인했고 끊지 않았다). 출입증이 지금 살아 있는지와는 다르다 */
export const DRIVE_LINKED_KEY = 'driveLinked'
/** 마지막으로 끝까지 동기화한 시각 (UTC ISO) */
export const LAST_SYNC_KEY = 'lastSyncAt'

let linked: boolean | null = null

/** 드라이브를 연결했는지. 한 번 읽고 기억한다. 저장소를 못 열면 false */
export async function isDriveLinked(): Promise<boolean> {
  if (linked === null) linked = (await dbGet<boolean>('meta', DRIVE_LINKED_KEY).catch(() => false)) === true
  return linked
}

/** 연결 여부를 적는다 (로그인·연결 끊기) */
export async function setDriveLinked(value: boolean): Promise<void> {
  await dbPut('meta', value, DRIVE_LINKED_KEY)
  linked = value
}

/**
 * 기록에 일이 생겼다고 줄에 적는다. 드라이브를 연결하지 않았으면 아무것도 하지 않는다.
 * 앞 항목을 읽고 덮어쓰기를 트랜잭션 하나로 한다 — 사이에 다른 일이 끼어 "사진도 올리기"를 잃지 않게.
 * 실패해도 던지지 않는다: 기록은 이미 기기에 저장됐고, 다음 동기화가 기기와 드라이브를 견줘 빠진 것을 다시 찾는다(planPull).
 */
export async function noteChange(id: string, op: QueueEntry['op'], photos: boolean): Promise<void> {
  if (!(await isDriveLinked())) return
  await dbWriteAll(['syncQueue'], (store) => {
    const q = store('syncQueue')
    const req = q.get(id)
    // 같은 트랜잭션 안에서 읽은 뒤 쓴다 (요청 콜백 안의 요청은 트랜잭션을 이어 간다)
    req.onsuccess = () => { q.put(queueChange(req.result as QueueEntry | undefined, id, op, photos, new Date()), id) }
  }).catch(() => {})
}

/** 줄 전체 */
export function listQueue(): Promise<QueueEntry[]> {
  return dbGetAll<QueueEntry>('syncQueue')
}

/** 항목을 고쳐 쓴다 (실패 횟수 올리기) — 그 사이 새 일이 들어왔으면(at이 다르면) 새 일을 남긴다 */
export function saveFailure(entry: QueueEntry): Promise<void> {
  return dbWriteAll(['syncQueue'], (store) => {
    const q = store('syncQueue')
    const req = q.get(entry.id)
    req.onsuccess = () => { if ((req.result as QueueEntry | undefined)?.at === entry.at) q.put(entry, entry.id) }
  })
}

/**
 * 끝난 항목을 뺀다 — 단, 올리는 사이에 같은 기록에 새 일이 들어왔으면(at이 다르면) 빼지 않는다.
 * 그 새 일은 아직 드라이브에 닿지 않았다.
 */
export function finishEntry(entry: QueueEntry): Promise<void> {
  return dbWriteAll(['syncQueue'], (store) => {
    const q = store('syncQueue')
    const req = q.get(entry.id)
    req.onsuccess = () => { if ((req.result as QueueEntry | undefined)?.at === entry.at) q.delete(entry.id) }
  })
}
