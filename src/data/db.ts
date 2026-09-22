/**
 * 브라우저 로컬 DB(IndexedDB)의 얇은 포장. 라이브러리를 쓰지 않았다 — 필요한 동작이 넷(get·getAll·put·delete)뿐이다.
 *
 * 저장소 셋:
 * - sightings: 기록 (키 = id)
 * - photos: 사진 Blob (키 = `${기록id}:${판}`)
 * - meta: 마지막 백업 시각 같은 낱개 값
 */

const DB_NAME = 'bird-journal'
const DB_VERSION = 1
export type StoreName = 'sightings' | 'photos' | 'meta'

let opening: Promise<IDBDatabase> | null = null

/**
 * DB를 연다 (한 번만 열고 다시 쓴다).
 * 사생활 보호 모드처럼 IndexedDB가 막힌 환경에서는 한국어 Error로 거절된다 — 부르는 쪽이 사용자에게 알린다.
 */
export function openDb(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      // 버전을 올릴 때는 여기에 "없으면 만든다"만 더한다. 기존 저장소를 지우지 않는다
      if (!db.objectStoreNames.contains('sightings')) db.createObjectStore('sightings', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos')
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => { opening = null; reject(new Error('이 브라우저에서는 기록 저장소를 열 수 없습니다 (사생활 보호 모드일 수 있습니다).')) }
  })
  return opening
}

/** 요청 하나를 Promise로 바꾼다 */
function done<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('저장소 요청이 실패했습니다.'))
  })
}

/** 키로 하나를 읽는다. 없으면 undefined */
export async function dbGet<T>(store: StoreName, key: string): Promise<T | undefined> {
  const db = await openDb()
  return done(db.transaction(store).objectStore(store).get(key) as IDBRequest<T | undefined>)
}

/** 저장소의 전부를 읽는다 */
export async function dbGetAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDb()
  return done(db.transaction(store).objectStore(store).getAll() as IDBRequest<T[]>)
}

/** 키가 있는지 센다 (0 또는 1). 값을 읽지 않으므로 큰 Blob이 있어도 가볍다 */
export async function dbCount(store: StoreName, key: string): Promise<number> {
  const db = await openDb()
  return done(db.transaction(store).objectStore(store).count(key))
}

/** 넣거나 덮어쓴다. keyPath가 있는 저장소(sightings)는 key를 주지 않는다 */
export async function dbPut(store: StoreName, value: unknown, key?: string): Promise<void> {
  const db = await openDb()
  await done(db.transaction(store, 'readwrite').objectStore(store).put(value, key))
}

/** 지운다. 없는 키여도 성공한다 */
export async function dbDelete(store: StoreName, key: string): Promise<void> {
  const db = await openDb()
  await done(db.transaction(store, 'readwrite').objectStore(store).delete(key))
}
