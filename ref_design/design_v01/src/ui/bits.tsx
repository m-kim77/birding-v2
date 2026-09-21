import type { ReactNode } from 'react'
import Icon from './Icon'
import type { IconName } from './iconPaths'

/** 화면 맨 위 제목 줄. `onBack`이 있으면 뒤로 가기 화살표가 붙는다 */
export function ScreenHead({ title, sub, onBack, right }: { title: string; sub?: string; onBack?: () => void; right?: ReactNode }) {
  return (
    <header className="screen-head">
      {onBack && <button type="button" className="icon-btn" aria-label="뒤로" onClick={onBack}><Icon name="back" /></button>}
      <div className="screen-head-text">
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {right}
    </header>
  )
}

/** 카드. 테마가 바탕·모서리·그림자·테두리를 정한다 */
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>
}

/** 아이콘 + 글자 한 줄. 자동으로 채워진 정보(시각·위치·촬영 정보)를 보여 준다 */
export function Fact({ icon, children, sub }: { icon: IconName; children: ReactNode; sub?: string }) {
  return (
    <div className="fact">
      <Icon name={icon} size={18} />
      <div><span>{children}</span>{sub && <small>{sub}</small>}</div>
    </div>
  )
}

/** 상태 알림 띠. tone에 따라 성공·주의·오류 색을 쓴다 (색의 뜻은 모든 테마에서 같다) */
export function Banner({ tone, icon, children, action }: { tone: 'info' | 'warn' | 'err' | 'ok'; icon: IconName; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={`banner banner-${tone}`} role={tone === 'err' ? 'alert' : 'status'}>
      <Icon name={icon} size={18} />
      <p>{children}</p>
      {action}
    </div>
  )
}

/** 진행률 막대. `value`는 0~1 */
export function Progress({ value, label }: { value: number; label: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100)
  return (
    <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="progress-fill" style={{ width: `${pct}%` }} />
    </div>
  )
}

/** 작은 꼬리표 (도장·상태) */
export function Tag({ children, tone = 'plain' }: { children: ReactNode; tone?: 'plain' | 'accent' | 'warn' }) {
  return <span className={`tag tag-${tone}`}>{children}</span>
}
