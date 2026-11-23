import { useEffect, useState, type RefObject } from 'react'

/** 화면 위아래로 이만큼(스크롤 영역 높이의 비율) 앞서 '가깝다'고 본다 — 빨리 내려도 칸이 닿기 전에 사진을 읽기 시작한다 */
const AHEAD = '100% 0px'

/** 스크롤 영역 하나의 감시자와, 거기서 가까워지기를 기다리는 요소마다 부를 함수 */
interface Watcher { root: Element | null; io: IntersectionObserver; waiting: Map<Element, () => void> }

/** 스크롤 영역마다 감시자 하나. 칸마다 IntersectionObserver를 만들면 기록 수백 건에 감시자도 수백 개가 된다 */
const watchers = new Map<Element | null, Watcher>()

/**
 * 요소를 품은 가장 가까운 스크롤 영역. 앱은 창이 아니라 `.app-main`이 스크롤해서(styles/shell.css), 창을 기준으로 보면
 * 미리 보는 여백(AHEAD)이 스크롤 영역 밖에서 잘려 칸이 실제로 보일 때에야 읽기 시작한다. 찾지 못하면 null(창).
 */
function scrollRoot(el: Element): Element | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const y = getComputedStyle(p).overflowY
    if (y === 'auto' || y === 'scroll') return p
  }
  return null
}

/** 요소 하나의 감시를 그친다. 그 스크롤 영역에서 기다리는 요소가 없어지면 감시자도 닫는다 */
function unwatch(w: Watcher, el: Element) {
  w.waiting.delete(el)
  w.io.unobserve(el)
  if (w.waiting.size === 0) { w.io.disconnect(); watchers.delete(w.root) }
}

/** 이 스크롤 영역의 감시자. 없으면 만든다 — 가까워진 요소는 감시를 그친 뒤 그 함수를 부른다 */
function watcherFor(root: Element | null): Watcher {
  const found = watchers.get(root)
  if (found) return found
  const w: Watcher = {
    root,
    waiting: new Map(),
    io: new IntersectionObserver((entries) => {
      for (const e of entries) {
        // 이미 그친 요소는 건너뛴다 — 그치면서 감시자를 닫았으면 같은 영역에 새로 만든 감시자를 지우게 된다
        const call = w.waiting.get(e.target)
        if (!e.isIntersecting || !call) continue
        unwatch(w, e.target)
        call()
      }
    }, { root, rootMargin: AHEAD }),
  }
  watchers.set(root, w)
  return w
}

/** `el`이 화면 가까이 오면 `onNear`를 한 번 부른다. 돌려준 함수를 부르면 (부르기 전이면) 감시를 그친다 */
function watchNear(el: Element, onNear: () => void): () => void {
  const w = watcherFor(scrollRoot(el))
  w.waiting.set(el, onNear)
  w.io.observe(el)
  return () => { if (w.waiting.get(el) === onNear) unwatch(w, el) }
}

/**
 * `ref`의 요소가 화면 가까이 온 적이 있는지. 한 번 true가 되면 그대로다 (다시 멀어져도 읽은 사진을 버리지 않는다).
 * `enabled`가 거짓이면 처음부터 true. IntersectionObserver가 없는 브라우저도 true — 미루지 못할 뿐 사진은 나온다.
 */
export function useNearViewport(ref: RefObject<Element | null>, enabled: boolean): boolean {
  const [near, setNear] = useState(false)
  useEffect(() => {
    if (!enabled || near) return
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') { setNear(true); return }
    return watchNear(el, () => setNear(true))
  }, [enabled, near, ref])
  return near || !enabled
}
