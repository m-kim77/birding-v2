import type { IconName } from '../ui/iconPaths'

/** 화면 주소. 라우터 라이브러리 없이 방문 기록의 칸(history.state)에 적어 둔다 — 옮기는 곳은 app/nav.ts 한 곳 */
export type Route =
  | { name: 'records' }
  | { name: 'detail'; id: string }
  | { name: 'dex' }
  | { name: 'map' }
  | { name: 'settings' }
  | { name: 'record' }
  /** 새소리 듣기 (작업 32). 기록을 만들지 않는다 — 들어오는 길은 새 기록 첫 화면의 버튼 */
  | { name: 'sound' }
  /** 사진 없이 기록 (작업 39). 들어오는 길은 새 기록 첫 화면의 버튼이고, 그 칸을 바꿔 끼운다 (App.tsx) */
  | { name: 'quick' }

export type TabName = 'records' | 'dex' | 'map' | 'settings'

/**
 * 탭은 네 개다. 같은 기록을 보는 세 가지 방법 — 일지(날짜순, 관찰 한 건씩) · 도감(종별, 종마다 한 칸) · 지도(장소별) — 과 설정이다.
 * 홈 탭을 두지 않았다 — 홈에 있던 통계·최근 기록은 "기록" 화면 맨 위와 겹친다.
 * "종 판정" 탭도 두지 않았다 — "+"에서 시작하는 기록 흐름의 한 단계다.
 * "새소리" 탭도 두지 않았다 (2026-09-27) — 새 기록 첫 화면의 버튼으로 연다. 하단이 다섯 칸(탭 넷 + "+")이라 탭을 더하면 폰에서 좁다.
 */
export const TABS: Array<{ name: TabName; label: string; icon: IconName }> = [
  { name: 'records', label: '일지', icon: 'book' },
  { name: 'dex', label: '도감', icon: 'cards' },
  { name: 'map', label: '지도', icon: 'map' },
  { name: 'settings', label: '설정', icon: 'gear' },
]

/** 상세·기록하기처럼 탭에 없는 화면에서 어느 탭을 켜 둘지 */
export function activeTab(route: Route): TabName | null {
  if (route.name === 'detail') return 'records'
  if (route.name === 'record' || route.name === 'sound' || route.name === 'quick') return null
  return route.name
}

/** id 없이 이름만으로 되는 화면들 */
const PLAIN_ROUTES = new Set(['records', 'dex', 'map', 'settings', 'record', 'sound', 'quick'])

/**
 * 방문 기록에서 꺼낸 값이 이 앱의 화면 주소인지. 새로고침·뒤로가기 뒤에 app/navPlan.ts가 칸을 읽을 때 쓴다.
 * 옛 판이 남긴 값이나 모르는 화면 이름은 false — 그러면 부르는 쪽이 첫 화면(일지)으로 연다.
 */
export function isRoute(x: unknown): x is Route {
  if (typeof x !== 'object' || x === null) return false
  const { name, id } = x as { name?: unknown; id?: unknown }
  if (name === 'detail') return typeof id === 'string' && id !== ''
  return typeof name === 'string' && PLAIN_ROUTES.has(name)
}
