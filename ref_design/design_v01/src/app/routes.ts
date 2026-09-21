import type { IconName } from '../ui/iconPaths'

/** 화면 주소. 초안이라 라우터 라이브러리 없이 상태 하나로 든다 */
export type Route =
  | { name: 'records' }
  | { name: 'detail'; id: string }
  | { name: 'dex' }
  | { name: 'map' }
  | { name: 'settings' }
  | { name: 'record' }
  | { name: 'sound' }

export type TabName = 'records' | 'dex' | 'map' | 'settings'

/**
 * 탭은 네 개다. 홈 탭을 두지 않았다 — 홈에 있던 통계·최근 기록은 "기록" 화면 맨 위와 겹친다.
 * "종 판정"·"새소리" 탭도 두지 않았다 — 둘 다 "+"에서 시작하는 기록 흐름의 한 단계다.
 */
export const TABS: Array<{ name: TabName; label: string; icon: IconName }> = [
  { name: 'records', label: '기록', icon: 'book' },
  { name: 'dex', label: '도감', icon: 'cards' },
  { name: 'map', label: '지도', icon: 'map' },
  { name: 'settings', label: '설정', icon: 'gear' },
]

/** 상세·기록하기처럼 탭에 없는 화면에서 어느 탭을 켜 둘지 */
export function activeTab(route: Route): TabName | null {
  if (route.name === 'detail') return 'records'
  if (route.name === 'record' || route.name === 'sound') return null
  return route.name
}
