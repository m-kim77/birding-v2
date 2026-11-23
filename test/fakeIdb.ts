/**
 * node 시험용 가짜 IndexedDB (`globalThis.indexedDB`). `src/data/db.ts`가 쓰는 것만 안다 —
 * open · transaction · objectStore의 get / getAll / getAllKeys / count / put / delete, 연결의 close·onclose·onversionchange.
 *
 * 브라우저처럼 요청의 성공은 다음 차례(setTimeout)에 알리고, 그 콜백 안에서 만든 요청은 트랜잭션을 이어 간다.
 * 트랜잭션을 만든 차례가 지나 할 일이 비면 저절로 끝나고(complete), 끝난 뒤에 요청을 만들면 TransactionInactiveError를 던진다 —
 * 그래서 "트랜잭션 안에서 다시 읽고 쓴다"는 코드가 사이에 await를 끼우면 시험이 실패한다.
 * 흉내 내지 않는 것: 되돌리기(abort의 rollback), 트랜잭션 사이의 순서, 용량 부족. 읽고 쓰는 내용을 보는 시험에만 쓴다.
 */

/** 다음 차례에 돌린다 (브라우저의 IndexedDB 이벤트처럼 task로) */
const later = (fn: () => void) => { setTimeout(fn, 0) }

/** 저장할 때의 복제 — Blob은 그대로 둔다 (가짜 사진은 글자를 쓴다) */
const clone = <T>(v: T): T => (v instanceof Blob ? v : structuredClone(v))

/** 요청 하나 */
class FakeRequest {
  result: unknown = undefined
  error: DOMException | null = null
  onsuccess: (() => void) | null = null
  onerror: (() => void) | null = null
  onupgradeneeded: (() => void) | null = null
  onblocked: (() => void) | null = null
}

/** 저장소 이름 → (키 → 값). 연결을 새로 열어도 같은 것을 본다 */
type Data = Map<string, Map<string, unknown>>

/** 트랜잭션 하나 — 할 일이 비면 저절로 끝난다 */
class FakeTransaction {
  oncomplete: (() => void) | null = null
  onabort: (() => void) | null = null
  error: DOMException | null = null
  private pending = 0
  private active = true
  private done = false
  // 매개변수 속성(private data 등)은 node의 타입 지우기가 받지 않아 필드로 적는다
  private data: Data
  private keyPaths: Map<string, string | undefined>
  private names: string[]

  constructor(data: Data, keyPaths: Map<string, string | undefined>, names: string[]) {
    this.data = data
    this.keyPaths = keyPaths
    this.names = names
    // 만든 차례가 끝나면 더는 요청을 받지 않는다 — 그때 할 일이 없으면 끝난다
    later(() => { this.active = false; this.settle() })
  }

  /** 저장소 하나. 이 트랜잭션에 넣지 않은 이름이면 브라우저처럼 NotFoundError */
  objectStore(name: string) {
    if (!this.names.includes(name)) throw new DOMException(`${name}은 이 트랜잭션에 없다`, 'NotFoundError')
    const map = this.data.get(name)!
    const keyPath = this.keyPaths.get(name)
    return {
      get: (key: string) => this.request(() => clone(map.get(key))),
      getAll: () => this.request(() => [...map.values()].map(clone)),
      getAllKeys: () => this.request(() => [...map.keys()]),
      count: (key: string) => this.request(() => (map.has(key) ? 1 : 0)),
      put: (value: unknown, key?: string) => {
        // 브라우저처럼 부르는 순간에 복제한다 (부른 뒤에 값을 고쳐도 저장되는 값은 그대로)
        const copy = clone(value)
        const k = key ?? String((copy as Record<string, unknown>)[keyPath ?? ''])
        return this.request(() => { map.set(k, copy); return k })
      },
      delete: (key: string) => this.request(() => { map.delete(key) }),
    }
  }

  /** 되돌리기는 흉내 내지 않고 끝냈다고만 알린다 */
  abort(): void {
    if (this.done) return
    this.done = true
    later(() => this.onabort?.())
  }

  /** 요청을 받아 다음 차례에 돌리고 성공을 알린다. 끝난 트랜잭션이면 던진다 */
  private request(run: () => unknown): FakeRequest {
    if (!this.active || this.done) throw new DOMException('트랜잭션이 이미 끝났다', 'TransactionInactiveError')
    const req = new FakeRequest()
    this.pending += 1
    later(() => {
      if (this.done) return
      req.result = run()
      this.pending -= 1
      // 성공 콜백 안에서는 요청을 더 만들 수 있다 (트랜잭션을 이어 간다)
      this.active = true
      try { req.onsuccess?.() } finally { this.active = false }
      this.settle()
    })
    return req
  }

  /** 할 일이 비었으면 끝낸다 */
  private settle(): void {
    if (this.pending > 0 || this.active || this.done) return
    this.done = true
    later(() => this.oncomplete?.())
  }
}

/** 연결 하나 */
export class FakeConnection {
  closed = false
  onclose: (() => void) | null = null
  onversionchange: (() => void) | null = null
  private data: Data
  private keyPaths: Map<string, string | undefined>
  readonly objectStoreNames: { contains: (name: string) => boolean }

  constructor(data: Data, keyPaths: Map<string, string | undefined>) {
    this.data = data
    this.keyPaths = keyPaths
    this.objectStoreNames = { contains: (name) => data.has(name) }
  }

  /** 판 올리기 때만 부른다 */
  createObjectStore(name: string, opts?: { keyPath?: string }): void {
    this.data.set(name, new Map())
    this.keyPaths.set(name, opts?.keyPath)
  }

  /** 닫힌 연결이면 브라우저처럼 InvalidStateError를 던진다 */
  transaction(names: string | string[], _mode?: string): FakeTransaction {
    if (this.closed) throw new DOMException('연결이 닫혔다', 'InvalidStateError')
    return new FakeTransaction(this.data, this.keyPaths, [names].flat())
  }

  close(): void {
    this.closed = true
  }

  /** 브라우저가 연결을 끊은 것처럼 — 아이폰의 'Connection to Indexed Database server lost'. onclose를 알린다 */
  lose(): void {
    this.closed = true
    this.onclose?.()
  }

  /** 알림 없이 닫힌 것처럼 — 닫힘 알림이 오기 전에 쓰려 한 경우 */
  closeSilently(): void {
    this.closed = true
  }
}

/** 가짜 IndexedDB를 깔고, 시험이 안을 들여다볼 손잡이를 준다 */
export function installFakeIdb() {
  const data: Data = new Map()
  const keyPaths = new Map<string, string | undefined>()
  const connections: FakeConnection[] = []
  let version = 0
  const fake = {
    connections,
    /** open을 부른 횟수 */
    opens: 0,
    /** 값을 바로 넣는다 (시험의 처음 상태) */
    seed(store: string, key: string, value: unknown) { data.get(store)!.set(key, clone(value)) },
    /** 값을 바로 읽는다 */
    peek(store: string, key: string): unknown { return data.get(store)?.get(key) },
    /** 저장소의 키 전부 */
    keys(store: string): string[] { return [...(data.get(store)?.keys() ?? [])] },
    /** 모든 저장소를 비운다 (저장소 자체는 남긴다) */
    clear() { for (const m of data.values()) m.clear() },
  }
  ;(globalThis as { indexedDB?: unknown }).indexedDB = {
    open(_name: string, v: number) {
      fake.opens += 1
      const req = new FakeRequest()
      later(() => {
        const db = new FakeConnection(data, keyPaths)
        connections.push(db)
        req.result = db
        if (v > version) { version = v; req.onupgradeneeded?.() }
        req.onsuccess?.()
      })
      return req
    },
  }
  return fake
}
