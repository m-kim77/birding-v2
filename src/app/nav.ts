import { HOME, planLeave, planOpen, planReplace, planTab, readEntry, screenEntry, type NavEntry, type NavStep } from './navPlan'
import type { Route, TabName } from './routes'

/**
 * 방문 기록(window.history)을 만지는 유일한 곳. 화면은 여기 함수로만 옮긴다 — history를 직접 부르면 칸 셈(depth)이
 * 어긋나 뒤로가기가 엉뚱한 곳으로 간다. 무엇을 할지는 navPlan.ts가 정하고, React는 useNav.ts로 읽는다.
 * 지금 칸이 곧 지금 화면이다 (원본이 하나라 화면과 방문 기록이 어긋날 수 없다). 주소(URL)는 바꾸지 않는다.
 */

let current: NavEntry = screenEntry(HOME, 0)
const listeners = new Set<() => void>()
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
  notify()
  done?.then?.()
}

/**
 * 앱을 열 때 한 번 (main.tsx, 그리기 전). 지금 칸이 이 앱의 것이면 그 화면으로 연다 — 새로고침해도, 폰이 뒤에 둔 탭을
 * 다시 읽어도 보던 화면이다. 아니면(처음 연 칸) 첫 화면 칸으로 적는다. 두 번 불러도 한 번만 한다.
 */
export function startNav(): void {
  if (started) return
  started = true
  const saved = readEntry(history.state)
  current = saved ?? screenEntry(HOME, 0)
  if (!saved) history.replaceState(current, '')
  window.addEventListener('popstate', onPop)
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

/**
 * 오류 화면의 '다시 열기' 바로 전에 부른다: 지금 칸을 일지로 고쳐 적는다. 칸은 새로고침 뒤에도 남으므로,
 * 안 고치면 같은 화면이 다시 열려 같은 오류가 날 수 있다. 칸 셈(depth)은 그대로 둔다 — 아래 칸들은 그대로 있다.
 */
export function resetToHome(): void {
  history.replaceState(screenEntry(HOME, current.depth), '')
}
