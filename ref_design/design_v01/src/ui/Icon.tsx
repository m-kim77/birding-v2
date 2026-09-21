import { ICON_PATHS, type IconName } from './iconPaths'

/**
 * 선 아이콘. 색은 글자색(currentColor)을 따른다.
 * 장식용이라 스크린리더에는 숨긴다 — 뜻은 옆의 글자나 버튼의 aria-label이 전한다.
 */
export default function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">{ICON_PATHS[name]}</svg>
}
