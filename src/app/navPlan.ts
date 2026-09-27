// node --test가 이 파일을 직접 읽는다 — node는 확장자 없는 경로를 못 푼다
import { isRoute, type Route, type TabName } from './routes.ts'

/**
 * 폰 뒤로가기와 화면 이동의 규칙. 순수 함수만 둔다 — 브라우저의 방문 기록(history)을 실제로 만지는 쪽은 nav.ts.
 * 화면 하나 = 방문 기록의 칸 하나. 지금 칸과 요청을 받아 "칸 쌓기 / 바꿔 끼우기 / 몇 칸 뒤로"를 정한다.
 * 탭은 안드로이드 앱의 관례를 따른다: 탭끼리 옮겨도 칸이 쌓이지 않고 일지 위에 탭 하나만 둔다 — 그래서 뒤로는 탭 → 일지 → 앱 밖.
 * 시트·수정 모드 같은 "겹"도 화면 위에 칸을 하나 쌓는다 — 뒤로가기가 겹부터 닫는다. 겹 칸은 늘 맨 위에만 있다.
 */

/** 이 앱이 쓴 칸이라는 표시. 옛 판이나 다른 페이지가 남긴 history.state와 가른다 */
export const NAV_MARK = 'bird-journal/nav@1'

/** 첫 화면. 방문 기록에서 이 앱의 맨 아래 칸은 늘 이것이다 */
export const HOME: Route = { name: 'records' }

/** 방문 기록 한 칸에 적어 두는 것 (history.state). 새로고침해도 남는다 */
export interface NavEntry {
  mark: typeof NAV_MARK
  route: Route
  /** 이 칸 밑에 이 앱의 칸이 몇 개 있나. 앱을 처음 연 칸(일지)이 0 */
  depth: number
  /** 겹 칸이면 그 겹의 표 (열 때마다 새로 만든다). 화면 칸이면 없다. route는 밑의 화면과 같다 */
  layer?: string
  /** 겹 칸이 올라앉은 화면 칸의 depth */
  base?: number
}

/** 방문 기록에 할 일 */
export type NavStep =
  | { kind: 'none' }
  | { kind: 'push'; entry: NavEntry }
  | { kind: 'replace'; entry: NavEntry }
  /** delta칸 뒤로 (음수). again이면 도착한 칸에서 같은 요청을 다시 계획한다 — 탭 옮기기가 "걷고 나서 바꿔 끼우기"를 두 번에 나눠 한다 */
  | { kind: 'go'; delta: number; again?: true }

/** 화면 칸 하나 */
export function screenEntry(route: Route, depth: number): NavEntry {
  return { mark: NAV_MARK, route, depth }
}

/** 0 이상의 정수인지 — 칸 셈으로 쓸 수 있는 값 */
function isDepth(x: unknown): x is number {
  return Number.isInteger(x) && (x as number) >= 0
}

/**
 * history.state를 이 앱의 칸으로 읽는다. 모양이 틀리면 null — 부르는 쪽이 첫 화면으로 연다.
 * 새로고침·뒤로가기 뒤에 부르므로 무엇이 들어 있을지 믿지 않는다 (옛 판, 다른 페이지, 손댄 값).
 */
export function readEntry(state: unknown): NavEntry | null {
  if (typeof state !== 'object' || state === null) return null
  const s = state as Record<string, unknown>
  if (s.mark !== NAV_MARK || !isRoute(s.route) || !isDepth(s.depth)) return null
  const entry = screenEntry(s.route, s.depth)
  if (s.layer === undefined) return entry
  if (typeof s.layer !== 'string' || !isDepth(s.base) || s.base >= s.depth) return null
  return { ...entry, layer: s.layer, base: s.base }
}

/** 지금 화면 칸의 depth — 겹 칸이면 그 밑의 화면 칸 */
export function baseDepth(cur: NavEntry): number {
  return cur.base ?? cur.depth
}

/**
 * 화면을 연다 — 지금 칸 위에 칸을 쌓는다. 뒤로가기가 지금 화면으로 돌아온다.
 * 겹 안에서 열면(도감 시트의 기록 목록) 겹 칸을 새 화면으로 바꿔 끼운다 — 쌓으면 겹이 닫힌 뒤 그 칸이 헛칸으로 남는다.
 */
export function planOpen(cur: NavEntry, route: Route): NavStep {
  if (cur.layer) return { kind: 'replace', entry: screenEntry(route, cur.depth) }
  return { kind: 'push', entry: screenEntry(route, cur.depth + 1) }
}

/** 지금 칸을 다른 화면으로 바꿔 끼운다 — 저장 직후 '완료'처럼, 떠나는 화면으로 뒤로 돌아올 일이 없을 때 */
export function planReplace(cur: NavEntry, route: Route): NavStep {
  return { kind: 'replace', entry: screenEntry(route, cur.depth) }
}

/**
 * 지금 화면을 떠나 그 아래 화면으로 — 화면의 '뒤로' 화살표가 폰의 뒤로가기와 같은 곳으로 간다. 열린 겹 칸도 함께 걷는다
 * (수정 모드에서 '뒤로'를 누르면 수정만 닫지 않고 화면을 떠난다 — 삭제 뒤에도 이 길로 간다).
 * 맨 아래 칸에서는 할 일이 없다. 맨 아래가 일지가 아니면(정상 흐름엔 없다) 일지로 바꿔 끼운다 — '뒤로'가 먹통이 되지 않게.
 */
export function planLeave(cur: NavEntry): NavStep {
  const base = baseDepth(cur)
  if (base > 0) return { kind: 'go', delta: base - cur.depth - 1 }
  if (cur.depth > 0) return { kind: 'go', delta: -cur.depth }
  return cur.route.name === HOME.name ? { kind: 'none' } : { kind: 'replace', entry: screenEntry(HOME, 0) }
}

/**
 * 탭을 누른다. 일지면 맨 아래 칸까지 걷는다. 다른 탭이면 일지 바로 위 칸(depth 1)에 그 탭을 둔다 —
 * 맨 아래면 쌓고, depth 1이면 바꿔 끼우고(이미 그 탭이면 할 일 없음), 더 위면 먼저 depth 1까지 걷은 뒤 다시 계획한다.
 */
export function planTab(cur: NavEntry, tab: TabName): NavStep {
  if (tab === HOME.name) return cur.depth > 0 ? { kind: 'go', delta: -cur.depth } : { kind: 'none' }
  if (cur.depth > 1) return { kind: 'go', delta: 1 - cur.depth, again: true }
  const entry = screenEntry({ name: tab } as Route, 1)
  if (cur.depth === 0) return { kind: 'push', entry }
  return cur.route.name === tab ? { kind: 'none' } : { kind: 'replace', entry }
}

/** 겹을 연다 — 지금 칸 위에 같은 화면의 겹 칸을 쌓는다. token은 그 겹의 표 (nav.ts가 만든다) */
export function planLayer(cur: NavEntry, token: string): NavStep {
  return { kind: 'push', entry: { ...screenEntry(cur.route, cur.depth + 1), layer: token, base: baseDepth(cur) } }
}

/**
 * 앱을 열었더니 지금 칸이 겹 칸이다 — 새로고침 전에 열려 있던 겹이다. 겹은 닫힌 채 시작하므로 그 칸을 걷는다
 * (안 걷으면 첫 뒤로가기가 화면은 그대로인 채 헛돈다).
 */
export function planDropStaleLayer(cur: NavEntry): NavStep {
  return cur.layer ? { kind: 'go', delta: baseDepth(cur) - cur.depth } : { kind: 'none' }
}
