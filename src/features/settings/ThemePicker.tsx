import Icon from '../../ui/Icon'
import { THEME_CHOICES, THEMES } from '../../theme/themes'

interface Props {
  choice: string
  onChoose: (id: string) => void
}

/**
 * 화면 테마 고르기. 미리보기 조각은 각 테마의 토큰 값으로 그린다 —
 * 이 화면이 테마의 이름을 아는 유일한 곳이고, 그것도 themes.ts의 목록을 그대로 돌 뿐이다.
 */
export default function ThemePicker({ choice, onChoose }: Props) {
  return (
    <div className="theme-grid" role="radiogroup" aria-label="화면 테마">
      {THEME_CHOICES.map((c) => {
        const light = THEMES.find((t) => t.id === c.light)!.tokens
        const dark = THEMES.find((t) => t.id === c.dark)!.tokens
        const on = c.id === choice
        return (
          <button key={c.id} type="button" role="radio" aria-checked={on} className={`theme-cell${on ? ' is-on' : ''}`} onClick={() => onChoose(c.id)}>
            <span className="theme-swatch" style={{ background: light.bgApp }}>
              <i style={{ background: light.bgCard, border: light.cardBorder, borderRadius: light.radiusCard }}>
                <b style={{ background: light.primary, borderRadius: light.radiusControl }} />
              </i>
              {/* 심플·모던처럼 라이트/다크가 다른 선택지는 반쪽을 다크로 보여 준다 */}
              {c.light !== c.dark && <u style={{ background: dark.bgApp }}><b style={{ background: dark.primary, borderRadius: dark.radiusControl }} /></u>}
            </span>
            <strong>{c.name}</strong>
            <small>{c.desc}</small>
            {on && <span className="theme-on"><Icon name="check" size={14} /></span>}
          </button>
        )
      })}
    </div>
  )
}
