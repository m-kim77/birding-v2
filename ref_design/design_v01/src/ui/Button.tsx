import type { ReactNode } from 'react'
import Icon from './Icon'
import type { IconName } from './iconPaths'

interface Props {
  children: ReactNode
  onClick?: () => void
  /**
   * primary는 화면마다 하나만 쓴다 — "이 화면에서 다음에 할 일"을 가리킨다.
   * quiet는 글자만 있는 보조 동작, danger는 되돌릴 수 없는 동작.
   */
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger'
  icon?: IconName
  disabled?: boolean
  /** 부모 폭을 다 채운다 (폰의 화면 아래 주 버튼) */
  block?: boolean
}

/**
 * 버튼. 높이 48px 이상 — 장갑 낀 손과 한 손 조작을 전제로 한다.
 */
export default function Button({ children, onClick, variant = 'secondary', icon, disabled, block }: Props) {
  return (
    <button type="button" className={`btn btn-${variant}${block ? ' btn-block' : ''}`} onClick={onClick} disabled={disabled}>
      {icon && <Icon name={icon} size={18} />}
      <span>{children}</span>
    </button>
  )
}
