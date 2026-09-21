import type { Verdict } from '../../types'
import './verdict.css'

/**
 * 판정의 근거와 참고한 자료. 판정 직후(기록하기)와 나중(기록 상세) 두 곳에서 같은 것을 쓴다.
 *
 * 참고 자료는 **도구가 실제로 읽은 문서**다 (모델이 적어 낸 주소가 아니다 — loop.ts collectReference).
 * 대표 사진을 함께 보여 주는 이유: 사용자가 자기 사진과 나란히 견줘 보고 판정을 믿을지 정할 수 있다.
 * 링크는 새 창으로 연다 — 기록하던 화면을 잃지 않게.
 */
export default function VerdictDetails({ verdict, open }: { verdict: Verdict; open?: boolean }) {
  const refs = verdict.references ?? []
  if (verdict.evidence.length === 0 && refs.length === 0) return null
  return (
    <details className="verdict-details" open={open}>
      <summary>근거 {verdict.evidence.length}개 · 참고한 자료 {refs.length}건</summary>
      {verdict.evidence.length > 0 && (
        <ul className="evidence-list">{verdict.evidence.map((e, i) => <li key={i}>{e.text}{e.source && <small>{e.source}</small>}</li>)}</ul>
      )}
      {refs.length > 0 && (
        <ul className="ref-list">
          {refs.map((r) => (
            <li key={r.url}>
              <a href={r.url} target="_blank" rel="noopener noreferrer">
                {r.image ? <img src={r.image} alt={`${r.title} 참고 사진`} loading="lazy" /> : <span className="ref-noimg" aria-hidden="true" />}
                <span><strong>{r.title}</strong><small>위키백과에서 보기 ↗</small></span>
              </a>
            </li>
          ))}
        </ul>
      )}
      <p className="hint">판정: {verdict.model}</p>
    </details>
  )
}
