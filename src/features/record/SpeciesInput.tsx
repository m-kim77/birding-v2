import { useState } from 'react'
import { SPECIES } from '../../data/species'

interface Props {
  value: string
  /** 전에 기록한 종 (최근 것부터). 추천에서 먼저 나온다 — 같은 동네를 다니면 같은 새를 다시 만난다 */
  known: string[]
  onChange: (name: string) => void
}

/** 추천 목록: 전에 본 종 먼저, 그다음 종 표. 최대 5개. 입력이 없으면 전에 본 종만 */
function suggest(query: string, known: string[]): string[] {
  const q = query.trim()
  if (!q) return known.slice(0, 5)
  const seen = known.filter((n) => n.includes(q))
  const rest = SPECIES.map((s) => s.ko).filter((n) => n.includes(q) && !seen.includes(n))
  return [...seen, ...rest].slice(0, 5)
}

/**
 * 새 이름 입력. 목록에 없는 이름도 그대로 적을 수 있다 (아종·미기록종을 막지 않는다).
 * 비워 둔 채 저장해도 된다 — 그러면 "이름 미정"으로 남는다.
 */
export default function SpeciesInput({ value, known, onChange }: Props) {
  const [focused, setFocused] = useState(false)
  const options = suggest(value, known).filter((n) => n !== value)
  return (
    <div className="species-input">
      <label className="field">
        <span>새 이름</span>
        <input value={value} placeholder="모르면 비워 두세요" autoComplete="off"
          onChange={(e) => onChange(e.target.value)} onFocus={() => setFocused(true)}
          // 추천 항목을 누르는 순간 blur가 먼저 오므로, 목록을 조금 늦게 닫는다
          onBlur={() => window.setTimeout(() => setFocused(false), 150)} />
      </label>
      {focused && options.length > 0 && (
        <ul className="suggest" role="listbox">
          {options.map((n) => <li key={n}><button type="button" role="option" aria-selected={false} onClick={() => onChange(n)}>{n}</button></li>)}
        </ul>
      )}
    </div>
  )
}
