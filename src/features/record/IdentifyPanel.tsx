import { Banner } from '../../ui/bits'
import Button from '../../ui/Button'
import Icon from '../../ui/Icon'
import type { Verdict } from '../../types'
import VerdictDetails from '../identify/VerdictDetails'
import type { AskState } from './useAsk'

interface Props {
  ask: { state: AskState; steps: string[]; verdict: Verdict | null; message: string; own: boolean; cancel: () => void }
  /** 자를 영역을 골랐는지. 안 골랐어도 물어볼 수 있다 — 그때는 사진 전체가 간다 */
  hasCrop: boolean
  /** 지금 이름 칸의 값 — 결과를 이미 넣었는지 보려고 */
  name: string
  onAsk: () => void
  onApply: (v: Verdict) => void
}

/**
 * AI 종 판정. 시작 전 · 진행 중 · 결과 · 실패의 네 모습을 가진다.
 * v1에 있던 provider·모델·최대 호출 수·시간 제한 입력은 없다 — 사용자가 정할 것은 "내 키를 쓸지"뿐이고 그건 설정에 있다.
 */
export default function IdentifyPanel({ ask, hasCrop, name, onAsk, onApply }: Props) {
  if (ask.state === 'server-down') {
    return (
      // 다시 시도: 서버가 돌아온 걸 사용자가 먼저 알 수도 있다. 문구는 서버가 보낸 이유를 그대로 쓴다 (llmClient.ts)
      <Banner tone="warn" icon="alert" action={<Button variant="quiet" onClick={onAsk}>다시 시도</Button>}>
        {ask.message || '판정 서버가 쉬는 중입니다.'} 이름 없이 먼저 저장해 둘 수 있습니다.
        {/* 기본 제공 AI가 막혔을 때 지금 당장 되는 유일한 길 — 설정으로 가는 버튼은 초안 보존(작업 3)과 함께 붙인다 */}
        {!ask.own && ' 설정 › AI 종 판정에서 내 API 키를 넣으면 바로 판정할 수 있습니다.'}
      </Banner>
    )
  }
  if (ask.state === 'failed') {
    return <Banner tone="err" icon="alert" action={<Button variant="quiet" onClick={onAsk}>다시 시도</Button>}>{ask.message}</Banner>
  }
  if (ask.state === 'running') {
    return (
      <div className="ask-running">
        <ol className="steps">
          {ask.steps.map((text, i) => {
            const now = i === ask.steps.length - 1
            return <li key={i} className={now ? 'is-now' : 'is-done'}><span className="step-dot">{!now && <Icon name="check" size={12} />}</span>{text}</li>
          })}
        </ol>
        <p className="hint">1~2분 걸릴 수 있습니다.</p>
        {/* 중단: 몇 분씩 걸리는 작업에는 빠져나올 길이 있어야 한다 */}
        <Button variant="quiet" icon="stop" onClick={ask.cancel}>중단</Button>
      </div>
    )
  }
  if (ask.state === 'done' && ask.verdict) {
    const v = ask.verdict
    const label = v.speciesKo || v.latin
    const applied = name === label
    return (
      <div className="verdict">
        <p className="verdict-kind"><Icon name="sparkle" size={16} /> AI 판정 · {v.kind}</p>
        <h3 className="display">{label} {v.speciesKo && <em>{v.latin}</em>}</h3>
        <p>{v.summary}</p>
        {v.others.length > 0 && <p className="hint">남은 후보: {v.others.join(', ')}</p>}
        {/* 근거는 버튼이 아니라 펼침이다 — 결과를 믿을지 판단하는 재료라 늘 가까이 있어야 한다 */}
        <VerdictDetails verdict={v} />
        {applied
          ? <p className="status-line is-ok"><Icon name="check" size={16} /> 이름 칸에 넣었습니다</p>
          // 이 이름으로: 사용자가 이미 적은 이름을 말없이 덮어쓰지 않으려고 누르게 한다
          : <Button icon="check" onClick={() => onApply(v)}>이 이름으로</Button>}
      </div>
    )
  }
  return (
    <div className="ask-idle">
      {/* AI에게 물어보기: 오래 걸리고 서버 자원(또는 사용자의 API 요금)을 쓰므로 자동으로 돌리지 않는다 */}
      <Button icon="sparkle" onClick={onAsk}>AI에게 물어보기</Button>
      {/* 자르지 않아도 보낼 수 있다. 다만 새가 작게 찍힌 사진은 잘라 보내야 잘 맞는다는 것을 알려 준다 */}
      {!hasCrop && <p className="hint">자르지 않으면 사진 전체를 보냅니다. 새가 작게 찍혔다면 잘라서 보내는 편이 정확합니다.</p>}
    </div>
  )
}
