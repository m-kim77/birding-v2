/**
 * 브라우저 로컬 DB(IndexedDB)의 얇은 포장. 라이브러리를 쓰지 않았다 — 필요한 동작이 get·getAll·count·put·delete와,
 * 여러 쓰기·읽기를 트랜잭션 하나로 묶는 dbWriteAll·dbReadAll뿐이다.
 *
 * 저장소 다섯:
 * - sightings: 기록 (키 = id)
 * - photos: 사진 Blob (키 = `${기록id}:${판}`, data/photoKey.ts). **기록의 사진만 둔다** — 설정의 정리(data/photoCheck.ts)가
 *   기록이 없는 키를 지운다. 다른 사진은 새 저장소에 둔다
 * - meta: 마지막 백업 시각 같은 낱개 값. 이동 기록의 드라이브 스위치·"지웠음" 표시 본 값도 여기 둔다 (data/tracks.ts·syncTracks.ts) —
 *   새 저장소를 만들지 않아 판은 3 그대로다 (판을 올리면 다른 탭이 열려 있을 때 "다른 탭을 닫으세요"로 거절된다)
 * - tracks: 이동 기록 점 (키 = UTC 날짜 'YYYY-MM-DD', 값 = PackedPoint[]). 백업에 넣지 않는다 (data/tracks.ts)
 * - syncQueue: 드라이브에 올릴 일 (키 = 기록 id, 값 = QueueEntry). 드라이브를 연결했을 때만 쌓인다 (data/syncQueue.ts)
 */

const DB_NAME = 'bird-journal'
// 판 이력: 1 = sightings·photos·meta / 2 = tracks 추가 / 3 = syncQueue 추가
const DB_VERSION = 3
export type StoreName = 'sightings' | 'photos' | 'meta' | 'tracks' | 'syncQueue'

let opening: Promise<IDBDatabase> | null = null
/** `opening`이 열어 준 연결 — 닫힌 연결의 기억만 버리려고 둔다 (그사이 새로 연 연결은 건드리지 않는다) */
let openedDb: IDBDatabase | null = null
/** 다른 탭이 저장소를 새 판으로 올리거나 지워서 이 탭이 연결을 놓았다 — 이 탭의 코드는 옛 판이라 새로 고칠 때까지 다시 열지 않는다 */
let replaced = false

/** 이 탭을 새로 고쳐야 할 때의 안내 (판이 바뀐 저장소를 옛 코드로 열면 기록이 망가질 수 있다) */
const RELOAD_MESSAGE = '다른 탭에서 앱이 새 판으로 바뀌었습니다. 이 화면을 새로 고쳐 주세요.'

/**
 * DB를 연다 (한 번만 열고 다시 쓴다). 연 연결이 나중에 닫히면 기억을 버려 다음 요청이 새로 연다 (watchConnection).
 * 사생활 보호 모드처럼 IndexedDB가 막힌 환경에서는 한국어 Error로 거절된다 — 부르는 쪽이 사용자에게 알린다.
 * 다른 탭이 옛 판을 열고 있어 판 올리기가 막혀도 한국어 Error로 거절된다 (기다리면 영원히 안 열릴 수 있다).
 * 다른 탭이 이미 새 판으로 올렸으면(이 탭이 옛 판) 새로 고치라는 한국어 Error로 거절된다.
 */
export function openDb(): Promise<IDBDatabase> {
  if (replaced) return Promise.reject(new Error(RELOAD_MESSAGE))
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
      if (!db.objectStoreNames.contains('syncQueue')) db.createObjectStore('syncQueue')
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
      watchConnection(req.result)
      resolve(req.result)
    }
    req.onerror = () => {
      opening = null
      // 디스크의 저장소가 이 코드보다 새 판이다 (다른 탭이 새 판의 앱으로 올렸다) — 사생활 보호 모드라는 안내는 틀린 말이 된다
      reject(new Error(req.error?.name === 'VersionError' ? RELOAD_MESSAGE : '이 브라우저에서는 기록 저장소를 열 수 없습니다 (사생활 보호 모드일 수 있습니다).'))
    }
  })
  return opening
}

/**
 * 연 연결을 기억하고, 나중에 닫히는 두 경우를 받는다.
 * - close: 브라우저가 연결을 닫았다 — 아이폰에서 오래 백그라운드에 두었다 돌아오면 'Connection to Indexed Database server lost'로 끊기고,
 *   앱을 연 채로 사이트 데이터를 지워도 그렇다. 기억을 버려 다음 읽기·쓰기가 새로 연다 (안 버리면 앱을 다시 열 때까지 저장이 모두 실패한다).
 * - versionchange: 다른 탭이 새 판으로 올리려 한다(또는 저장소를 지운다). 곧바로 연결을 놓아 그 탭이 "다른 탭을 닫으세요"에 막히지 않게 하고,
 *   이 탭은 옛 코드라 새로 고칠 때까지 저장소를 열지 않는다 — 사용자에게 새로 고치라고 알린다.
 */
function watchConnection(db: IDBDatabase): void {
  openedDb = db
  db.onclose = () => forget(db)
  db.onversionchange = () => {
    db.close()
    forget(db)
    replaced = true
    askReload()
  }
}

/** 이 연결의 기억을 버린다 — 다음 openDb가 새로 연다. 이미 다른 연결로 바뀌었으면 그대로 둔다 */
function forget(db: IDBDatabase): void {
  if (openedDb !== db) return
  openedDb = null
  opening = null
}

/**
 * 새로 고치라고 한 번 알린다 — 판 올리기는 아주 드문 일이라 따로 화면을 두지 않고 알림 창 하나로 한다.
 * 지금 보이는 탭이면 곧바로, 뒤에 있으면 다시 볼 때 띄운다. 화면이 없는 곳(node 시험)에서는 띄우지 않는다 — 그래도 다음 읽기·쓰기가 같은 안내로 거절된다.
 */
function askReload(): void {
  if (typeof document === 'undefined') return
  const show = () => {
    if (document.visibilityState !== 'visible') return
    document.removeEventListener('visibilitychange', show)
    window.alert(RELOAD_MESSAGE)
  }
  document.addEventListener('visibilitychange', show)
  show()
}

/** 연결이 닫혔거나 닫히는 중이라 트랜잭션을 만들 수 없을 때 브라우저가 던지는 오류인지 */
function isClosedConnection(e: unknown): boolean {
  return (e as { name?: unknown } | null)?.name === 'InvalidStateError'
}

/**
 * 연결을 받아 일을 시작한다. `start`는 트랜잭션을 **맨 먼저, 기다리지 않고** 만들고 결과 Promise를 돌려준다.
 * 기억한 연결이 이미 닫혀 트랜잭션을 만들 수 없으면(InvalidStateError — 닫힘 알림보다 먼저 쓰려 한 경우) 그 기억을 버리고
 * 한 번만 새로 열어 다시 시작한다. 그때는 요청을 하나도 만들지 못했으니 같은 쓰기가 두 번 되지 않는다.
 * 다시 해도 안 되거나 다른 오류면 그 오류로 거절된다. 하던 트랜잭션이 도중에 끊긴 것은 다시 하지 않는다 (그 Promise가 거절된다).
 */
async function withDb<T>(start: (db: IDBDatabase) => Promise<T>): Promise<T> {
  const db = await openDb()
  let job: Promise<T>
  try {
    job = start(db)
  } catch (e) {
    if (!isClosedConnection(e)) throw e
    forget(db)
    job = start(await openDb())
  }
  return job
}

/** 요청 하나를 Promise로 바꾼다 */
function done<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('저장소 요청이 실패했습니다.'))
  })
}

/** 키로 하나를 읽는다. 없으면 undefined */
export function dbGet<T>(store: StoreName, key: string): Promise<T | undefined> {
  return withDb((db) => done(db.transaction(store).objectStore(store).get(key) as IDBRequest<T | undefined>))
}

/** 저장소의 전부를 읽는다 */
export function dbGetAll<T>(store: StoreName): Promise<T[]> {
  return withDb((db) => done(db.transaction(store).objectStore(store).getAll() as IDBRequest<T[]>))
}

/** 키가 있는지 센다 (0 또는 1). 값을 읽지 않으므로 큰 Blob이 있어도 가볍다 */
export function dbCount(store: StoreName, key: string): Promise<number> {
  return withDb((db) => done(db.transaction(store).objectStore(store).count(key)))
}

/**
 * 넣거나 덮어쓴다. keyPath가 있는 저장소(sightings)는 key를 주지 않는다.
 * 트랜잭션이 확정(complete)될 때까지 기다린다 — 요청이 성공해도 용량 부족·디스크 오류는 확정 단계에서 abort로 온다.
 */
export function dbPut(store: StoreName, value: unknown, key?: string): Promise<void> {
  return dbWriteAll([store], (s) => { s(store).put(value, key) })
}

/** 지운다. 없는 키여도 성공한다. dbPut처럼 확정까지 기다린다 */
export function dbDelete(store: StoreName, key: string): Promise<void> {
  return dbWriteAll([store], (s) => { s(store).delete(key) })
}

/**
 * 저장 공간이 모자라 쓰지 못했다 (storageError가 QuotaExceededError를 바꾼 것). 부르는 쪽이 `instanceof`로 알아본다 —
 * 동기화의 받기는 이것을 보면 남은 받기를 그만둔다 (남은 기록도 사진을 다 받은 뒤 쓰기에서 똑같이 실패한다).
 */
export class StorageFullError extends Error {
  constructor() { super('저장 공간이 모자라 저장하지 못했습니다 — 백업한 뒤 기기의 저장 공간을 비워 주세요.') }
}

/**
 * 쓰기 실패를 사용자에게 보일 Error로 바꾼다. 저장 공간 부족(QuotaExceededError)만 한국어 안내의 StorageFullError로 바꾸고,
 * 나머지는 그대로 둔다 (Error가 아닌 값·빈 값이면 일반 안내). 순수 함수다 (node --test로 검사한다).
 */
export function storageError(e: unknown): Error {
  if ((e as { name?: unknown } | null)?.name === 'QuotaExceededError') return new StorageFullError()
  return e instanceof Error ? e : new Error('저장소에 쓰지 못했습니다.')
}

/**
 * 쓰기 여러 개를 트랜잭션 하나로 한다 — 다 되거나 하나도 안 된다. 중간에 탭이 닫히거나 저장 공간이 모자라도 반쪽이 남지 않는다.
 * `write`는 요청을 **만들기만** 하고 기다리지 않는다: 트랜잭션은 할 일이 비는 순간 저절로 끝나서, 사이에 await를 끼우면 뒤의 요청이 실패한다.
 * 요청 하나라도 실패하면 브라우저가 전부 되돌리고, 이 Promise는 그 오류로 거절된다 (용량 초과는 커밋 때 abort로만 온다 — 한국어 안내로 바꾼다).
 */
export function dbWriteAll(stores: StoreName[], write: (store: (name: StoreName) => IDBObjectStore) => void): Promise<void> {
  return withDb((db) => {
    // 트랜잭션은 Promise 밖에서 만든다 — 닫힌 연결이면 여기서 던져야 withDb가 새로 열어 다시 한다
    const tx = db.transaction(stores, 'readwrite')
    return new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onabort = () => reject(storageError(tx.error))
      try {
        write((name) => tx.objectStore(name))
      } catch (e) {
        // 요청을 만들다 던졌으면(복제할 수 없는 값 등) 앞서 만든 요청까지 되돌린다 — 그냥 두면 거기까지만 커밋된다
        tx.abort()
        reject(storageError(e))
      }
    })
  })
}

/**
 * 여러 저장소를 읽기 트랜잭션 하나로 읽는다 — 한순간의 모습이다. 쓰기 트랜잭션은 겹치는 읽기와 동시에 돌지 않아서
 * (다른 탭의 쓰기도), 따로 읽을 때처럼 "기록은 읽기 전, 사진은 읽은 뒤에 저장된" 어긋난 모습이 나오지 않는다.
 * `read`는 요청을 **만들기만** 하고, 트랜잭션이 끝난 뒤 결과를 꺼낼 함수를 돌려준다 (dbWriteAll과 같은 까닭으로 사이에 await를 끼우지 않는다).
 * 요청 하나라도 실패하면 그 오류로 거절된다.
 */
export function dbReadAll<T>(stores: StoreName[], read: (store: (name: StoreName) => IDBObjectStore) => () => T): Promise<T> {
  return withDb((db) => {
    // 트랜잭션은 Promise 밖에서 만든다 (dbWriteAll과 같은 까닭)
    const tx = db.transaction(stores, 'readonly')
    return new Promise<T>((resolve, reject) => {
      let take: (() => T) | null = null
      tx.oncomplete = () => {
        try { resolve(take!()) } catch (e) { reject(e) }
      }
      tx.onabort = () => reject(tx.error ?? new Error('저장소를 읽지 못했습니다.'))
      try {
        take = read((name) => tx.objectStore(name))
      } catch (e) {
        tx.abort()
        reject(e)
      }
    })
  })
}
