import { useState } from 'react'
import { ALL_SPECIES, KNOWN_SPECIES } from '../../mock/data'

interface Props {
  value: string
  onChange: (name: string) => void
}

/**
 * 추천 목록을 만든다. 전에 본 종이 먼저 나온다 — 같은 동네를 다니면 같은 새를 다시 만나기 때문이다.
 * 입력이 없으면 전에 본 종만, 있으면 전체에서 찾되 최대 5개.
 */
function suggest(query: string): string[] {
  const q = query.trim()
  if (!q) return KNOWN_SPECIES.slice(0, 5)
  const known = KNOWN_SPECIES.filter((n) => n.includes(q))
  const rest = ALL_SPECIES.filter((n) => n.includes(q) && !known.includes(n))
  return [...known, ...rest].slice(0, 5)
}

/**
 * 새 이름 입력. 목록에 없는 이름도 그대로 적을 수 있다 (아종·미기록종을 막지 않는다).
 * 비워 둔 채 저장해도 된다 — 그러면 "이름 미정"으로 남고 판정이 끝날 때 채워진다.
 */
export default function SpeciesInput({ value, onChange }: Props) {
  const [focused, setFocused] = useState(false)
  const options = suggest(value).filter((n) => n !== value)

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
          {options.map((n) => (
            <li key={n}><button type="button" role="option" aria-selected={false} onClick={() => onChange(n)}>{n}</button></li>
          ))}
        </ul>
      )}
    </div>
  )
}
