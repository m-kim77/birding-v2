/**
 * 브라우저 로컬 DB(IndexedDB)의 얇은 포장. 라이브러리를 쓰지 않았다 — 필요한 동작이 get·getAll·count·put·delete와,
 * 여러 쓰기를 트랜잭션 하나로 묶는 dbWriteAll뿐이다.
 *
 * 저장소 넷:
 * - sightings: 기록 (키 = id)
 * - photos: 사진 Blob (키 = `${기록id}:${판}`)
 * - meta: 마지막 백업 시각 같은 낱개 값
 * - tracks: 이동 기록 점 (키 = UTC 날짜 'YYYY-MM-DD', 값 = PackedPoint[]). 백업에 넣지 않는다 (data/tracks.ts)
 */

const DB_NAME = 'bird-journal'
// 판 이력: 1 = sightings·photos·meta / 2 = tracks 추가
const DB_VERSION = 2
export type StoreName = 'sightings' | 'photos' | 'meta' | 'tracks'

let opening: Promise<IDBDatabase> | null = null

/**
 * DB를 연다 (한 번만 열고 다시 쓴다).
 * 사생활 보호 모드처럼 IndexedDB가 막힌 환경에서는 한국어 Error로 거절된다 — 부르는 쪽이 사용자에게 알린다.
 * 다른 탭이 옛 판을 열고 있어 판 올리기가 막혀도 한국어 Error로 거절된다 (기다리면 영원히 안 열릴 수 있다).
 */
export function openDb(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    let blocked = false
    req.onupgradeneeded = () => {
      const db = req.result
      // 버전을 올릴 때는 여기에 "없으면 만든다"만 더한다. 기존 저장소를 지우지 않는다
      if (!db.objectStoreNames.contains('sightings')) db.createObjectStore('sightings', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos')
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta')
      if (!db.objectStoreNames.contains('tracks')) db.createObjectStore('tracks')
    }
    // 다른 탭이 옛 판을 열고 있으면 브라우저는 그 탭이 닫힐 때까지 이 요청을 보류하고 blocked만 알린다.
    // 조용히 기다리면 앱이 영원히 "읽는 중"이라 바로 거절하고 사용자에게 다른 탭을 닫으라고 말한다
    req.onblocked = () => {
      blocked = true
      opening = null
      reject(new Error('다른 탭에서 이 앱이 열려 있어 저장소를 새 판으로 올리지 못합니다. 다른 탭을 닫고 다시 여세요.'))
    }
    req.onsuccess = () => {
      // 거절한 뒤에 다른 탭이 닫혀 뒤늦게 열린 연결 — 다음 openDb가 새로 열므로 이것은 놓아준다
      if (blocked) { req.result.close(); return }
      resolve(req.result)
    }
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

/**
 * 쓰기 여러 개를 트랜잭션 하나로 한다 — 다 되거나 하나도 안 된다. 중간에 탭이 닫히거나 저장 공간이 모자라도 반쪽이 남지 않는다.
 * `write`는 요청을 **만들기만** 하고 기다리지 않는다: 트랜잭션은 할 일이 비는 순간 저절로 끝나서, 사이에 await를 끼우면 뒤의 요청이 실패한다.
 * 요청 하나라도 실패하면 브라우저가 전부 되돌리고, 이 Promise는 그 오류로 거절된다 (용량 초과는 커밋 때 abort로만 온다).
 */
export async function dbWriteAll(stores: StoreName[], write: (store: (name: StoreName) => IDBObjectStore) => void): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(stores, 'readwrite')
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(tx.error ?? new Error('저장소에 쓰지 못했습니다.'))
    try {
      write((name) => tx.objectStore(name))
    } catch (e) {
      // 요청을 만들다 던졌으면(복제할 수 없는 값 등) 앞서 만든 요청까지 되돌린다 — 그냥 두면 거기까지만 커밋된다
      tx.abort()
      reject(e)
    }
  })
}
