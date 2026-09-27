import { HOME, planDropStaleLayer, planLayer, planLeave, planOpen, planReplace, planTab, readEntry, screenEntry, type NavEntry, type NavStep } from './navPlan'
import type { Route, TabName } from './routes'

/**
 * 방문 기록(window.history)을 만지는 유일한 곳. 화면은 여기 함수로만 옮긴다 — history를 직접 부르면 칸 셈(depth)이
 * 어긋나 뒤로가기가 엉뚱한 곳으로 간다. 무엇을 할지는 navPlan.ts가 정하고, React는 useNav.ts로 읽는다.
 * 지금 칸이 곧 지금 화면이다 (원본이 하나라 화면과 방문 기록이 어긋날 수 없다). 주소(URL)는 바꾸지 않는다.
 */

let current: NavEntry = screenEntry(HOME, 0)
const listeners = new Set<() => void>()
/** 열린 겹들 — 뒤로가기가 도착할 때만 부른다 (쌓기·바꿔 끼우기로는 겹이 닫히지 않는다) */
const popListeners = new Set<() => void>()
let started = false

/**
 * 우리가 건 뒤로 이동(history.go)이 도착하기를 기다리는 중. 그동안 새 이동은 받지 않는다 —
 * 도착 전에 칸을 쌓으면 그 이동이 방금 쌓은 칸을 도로 걷는다 (크롬 실측). 두 번 빨리 누른 '뒤로'가 두 화면을 건너뛰지도 않는다.
 */
let waiting: { then?: () => void; until: number } | null = null
/** 도착 신호(popstate)가 이만큼 안 오면 기다림을 푼다 — 안 풀면 화면 이동이 영영 먹통이 된다 */
const WAIT_MS = 1000

/** 칸이 바뀌었다고 구독자(React)에게 알린다 */
function notify(): void {
  for (const f of listeners) f()
}

/** 우리가 건 뒤로 이동이 아직 도착하지 않았는지 */
function isWaiting(): boolean {
  return waiting !== null && performance.now() < waiting.until
}

/** 칸을 delta만큼 뒤로 걷는다 (음수만). 도착하면 then을 부른다. 기다리는 중이면 아무것도 하지 않는다 */
function traverse(delta: number, then?: () => void): void {
  if (delta >= 0 || isWaiting()) return
  waiting = { then, until: performance.now() + WAIT_MS }
  history.go(delta)
}

/** 계획을 방문 기록에 옮긴다. again은 'go' 계획이 도착한 뒤 다시 부를 요청이다 (탭 옮기기) */
function apply(step: NavStep, again?: () => void): void {
  if (step.kind === 'none') return
  if (step.kind === 'go') { traverse(step.delta, step.again ? again : undefined); return }
  if (isWaiting()) return
  if (step.kind === 'push') history.pushState(step.entry, '')
  else history.replaceState(step.entry, '')
  current = step.entry
  notify()
}

/** 뒤로가기(또는 우리가 건 뒤로 이동)가 도착했다 — 도착한 칸을 지금 화면으로 삼는다. 이 앱의 칸이 아니면 첫 화면으로 고쳐 적는다 */
function onPop(): void {
  const arrived = readEntry(history.state)
  current = arrived ?? screenEntry(HOME, 0)
  if (!arrived) history.replaceState(current, '')
  const done = waiting
  waiting = null
  for (const f of [...popListeners]) f()
  notify()
  done?.then?.()
}

/**
 * 앱을 열 때 한 번 (main.tsx, 그리기 전). 지금 칸이 이 앱의 것이면 그 화면으로 연다 — 새로고침해도, 폰이 뒤에 둔 탭을
 * 다시 읽어도 보던 화면이다. 아니면(처음 연 칸) 첫 화면 칸으로 적는다. 새로고침 전에 열려 있던 겹의 칸은 걷는다.
 * 두 번 불러도 한 번만 한다.
 */
export function startNav(): void {
  if (started) return
  started = true
  const saved = readEntry(history.state)
  current = saved ?? screenEntry(HOME, 0)
  if (!saved) history.replaceState(current, '')
  window.addEventListener('popstate', onPop)
  apply(planDropStaleLayer(current))
}

/** 지금 칸. 칸이 바뀔 때만 새 객체다 (useSyncExternalStore의 스냅숏) */
export function currentEntry(): NavEntry {
  return current
}

/** 칸이 바뀌면 부를 함수를 건다. 떼는 함수를 돌려준다 */
export function subscribeNav(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** 화면을 연다 — 뒤로가기가 지금 화면으로 돌아온다 */
export function openScreen(route: Route): void {
  apply(planOpen(current, route))
}

/** 지금 화면을 다른 화면으로 바꿔 끼운다 — 뒤로가기가 지금 화면으로 돌아오지 않는다 */
export function replaceScreen(route: Route): void {
  apply(planReplace(current, route))
}

/** 지금 화면을 떠난다 — 화면의 '뒤로' 화살표. 폰의 뒤로가기와 같은 곳으로 간다 */
export function leaveScreen(): void {
  apply(planLeave(current))
}

/** 탭을 누른다 — 탭끼리는 칸을 쌓지 않는다 (navPlan.ts planTab) */
export function switchTab(tab: TabName): void {
  apply(planTab(current, tab), () => switchTab(tab))
}

/** 겹 하나를 방문 기록과 묶어 둔 손잡이 (useNav.ts useBackLayer가 쓴다) */
export interface BackLayer {
  /** 겹이 다른 길(닫기 버튼·바깥 누르기·저장)로 닫혔다 — 한 박자 뒤에 쌓았던 칸을 걷는다. 그 사이에 keep()이 불리면 걷지 않는다 */
  release(): void
  /** 걷기를 그만두고 계속 쓴다. 이미 닫혔으면(뒤로가기로 걷혔거나 칸을 걷은 뒤) false */
  keep(): boolean
}

/**
 * 겹(시트·수정 모드)을 연다: 지금 화면 위에 칸을 하나 쌓고, 뒤로가기가 그 칸을 걷으면 onPopped를 부른다.
 * 다른 길로 닫히면 release()로 칸을 걷는다 — 안 걷으면 다음 뒤로가기가 화면은 그대로인 채 헛돈다.
 * 겹 안에서 다른 화면을 열면 그 칸이 화면으로 바뀌어 끼워지므로(navPlan planOpen) 걷을 것이 없다.
 * 우리가 건 뒤로 이동을 기다리는 중(몇 ms)에 열린 겹은 칸을 쌓지 못해 뒤로가기와 묶이지 않는다 — 닫기 버튼으로는 닫힌다.
 */
export function openLayer(onPopped: () => void): BackLayer {
  const token = `${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 8)}`
  apply(planLayer(current, token))
  const depth = current.depth
  let state: 'open' | 'releasing' | 'closed' = current.layer === token ? 'open' : 'closed'
  const onPop = (): void => {
    if (state === 'closed' || current.depth >= depth) return
    state = 'closed'
    popListeners.delete(onPop)
    onPopped()
  }
  if (state === 'open') popListeners.add(onPop)
  return {
    release() {
      if (state !== 'open') return
      state = 'releasing'
      // 개발 모드(StrictMode)는 effect를 걷었다가 곧바로 다시 건다 — 한 박자 미뤄서, 다시 걸리면(keep) 칸을 걷지 않는다
      queueMicrotask(() => {
        if (state !== 'releasing') return
        state = 'closed'
        popListeners.delete(onPop)
        // 칸이 아직 맨 위일 때만 걷는다. 뒤로 이동을 기다리는 중이면 traverse가 넘기고, 그 이동이 이 칸도 걷는다 (겹 칸은 늘 맨 위다).
        // 겹 둘이 한꺼번에 닫히는 곳은 없다 — 생기면 아래 겹의 칸이 남으므로 여기를 고친다
        if (current.layer === token) traverse(-1)
      })
    },
    keep() {
      if (state === 'releasing') state = 'open'
      return state === 'open'
    },
  }
}

/**
 * 오류 화면의 '다시 열기' 바로 전에 부른다: 지금 칸을 일지로 고쳐 적는다. 칸은 새로고침 뒤에도 남으므로,
 * 안 고치면 같은 화면이 다시 열려 같은 오류가 날 수 있다. 칸 셈(depth)은 그대로 둔다 — 아래 칸들은 그대로 있다.
 */
export function resetToHome(): void {
  history.replaceState(screenEntry(HOME, current.depth), '')
}
