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
  // 도구를 한 번도 안 쓰고 낸 답 — 옛 기록(references 자체가 없다)은 모르는 것이므로 말하지 않는다. '확정'인데 자료가 없으면 특히 의심할 만하다
  const unchecked = verdict.references !== undefined && refs.length === 0
    ? <p className="status-line is-warn">자료를 확인하지 않고 답했습니다{verdict.kind === '확정' ? ' — 확정이라도 근거가 약할 수 있습니다' : ''}.</p>
    : null
  if (verdict.evidence.length === 0 && refs.length === 0) return unchecked
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
      {unchecked}
      <p className="hint">판정: {verdict.model}</p>
    </details>
  )
}
