/**
 * 썸네일의 임시 주소(blob: URL)를 빌려 쓰는 작은 보관함. 일지에서 기록 상세로 갔다 돌아오면 목록이 새로 그려지는데,
 * 그때마다 수백 장을 DB에서 다시 읽고 주소를 새로 만들지 않게 최근 것을 남겨 둔다.
 *
 * 규칙은 둘이다.
 * - **쓰는 곳이 있는 주소는 해제하지 않는다.** 빌릴 때(take·put) 쓰는 수를 올리고 돌려줄 때(release) 내린다.
 *   화면에 붙어 있는 `<img>`의 주소를 해제하면 그 그림이 깨진다.
 * - **쓰는 곳이 없는 주소는 `limit`개까지만 남긴다.** 넘으면 가장 오래전에 빌린 것부터 해제한다 — 안 하면 Blob이 메모리에 계속 남는다.
 *
 * 이 파일은 import가 없다 (node --test가 읽는다 — test/photoUrlCache.test.ts). 해제는 부르는 쪽이 넘긴다 (브라우저는 URL.revokeObjectURL).
 * 사진은 기록을 만든 뒤 바뀌지 않으므로 같은 키의 주소가 낡을 일은 없다 — 사진이 없는 키는 넣지 않는다(다음에 다시 읽는다).
 */

interface Held {
  url: string
  /** 지금 이 주소를 쓰는 곳의 수 */
  users: number
}

export interface UrlCache {
  /** 남아 있으면 그 주소를 빌린다 (쓰는 수 +1). 없으면 null — 그때는 DB에서 읽어 put한다 */
  take(key: string): string | null
  /**
   * 새로 만든 주소를 넣고 빌린다. 그새 다른 곳이 같은 키를 넣었으면(둘이 동시에 읽은 경우) 새 주소는 곧바로 해제하고
   * 있던 것을 빌린다 — 돌려받은 주소를 써야 한다.
   */
  put(key: string, url: string): string
  /** 빌린 것을 돌려준다 (쓰는 수 -1). 빌리지 않은 키나 이미 다 돌려준 키면 아무것도 하지 않는다 */
  release(key: string): void
  /** 남아 있는지만 본다 — 빌리지 않는다. 그리기 전에 'DB를 읽을 필요가 있나'를 정할 때만 쓴다 (주소를 이것으로 쓰지 않는다) */
  has(key: string): boolean
}

/**
 * 보관함을 만든다. `limit`은 쓰는 곳이 없는 주소를 남기는 최대 수(0이면 돌려주는 즉시 해제), `revoke`는 주소를 해제하는 함수.
 * 순서는 빌린 때(take·put)로 센다 — 돌려준 때로 세면 목록이 한꺼번에 내려갈 때 목록 순서대로 돌려줘서, 맨 아래 칸만 남는다.
 */
export function createUrlCache(limit: number, revoke: (url: string) => void): UrlCache {
  // Map은 넣은 순서를 지킨다 — 빌릴 때 지우고 다시 넣어 맨 뒤(가장 최근)로 보낸다
  const held = new Map<string, Held>()
  let idle = 0

  /** 쓰는 곳이 없는 주소가 limit을 넘으면 가장 오래전에 빌린 것부터 해제한다. 쓰는 곳이 있는 주소는 건너뛴다 */
  function trim() {
    for (const [key, h] of held) {
      if (idle <= limit) return
      if (h.users > 0) continue
      held.delete(key)
      idle -= 1
      revoke(h.url)
    }
  }

  /** 맨 뒤로 보내며 쓰는 수를 올린다 */
  function borrow(key: string, h: Held): string {
    held.delete(key)
    held.set(key, h)
    if (h.users === 0) idle -= 1
    h.users += 1
    return h.url
  }

  return {
    take(key) {
      const h = held.get(key)
      return h ? borrow(key, h) : null
    },
    put(key, url) {
      const h = held.get(key)
      if (h) {
        if (h.url !== url) revoke(url)
        return borrow(key, h)
      }
      held.set(key, { url, users: 1 })
      return url
    },
    release(key) {
      const h = held.get(key)
      if (!h || h.users === 0) return
      h.users -= 1
      if (h.users > 0) return
      idle += 1
      trim()
    },
    has: (key) => held.has(key),
  }
}
