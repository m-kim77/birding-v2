import { IDENTIFY_STEPS } from '../../mock/data'
import { Banner } from '../../ui/bits'
import Button from '../../ui/Button'
import Icon from '../../ui/Icon'
import type { RecordDraft } from './useRecordDraft'

/**
 * AI 종 판정. 세 가지 모습을 가진다 — 시작 전, 진행 중, 결과.
 *
 * v1에 있던 provider·모델·최대 호출 수·시간 제한 입력은 뺐다. 그건 개발자용 조절 장치다.
 * 사용자가 정할 것은 "내 키를 쓸지"뿐이고 그건 설정 화면에 있다.
 */
export default function IdentifyPanel({ draft }: { draft: RecordDraft }) {
  const { ask, askStep, verdict, crop, name, askAI, cancelAsk, applyVerdict } = draft

  if (ask === 'server-down') {
    return (
      // 다시 시도: 서버가 돌아온 걸 사용자가 먼저 알 수도 있다. 저장해 두면 자동으로도 이어진다
      <Banner tone="warn" icon="alert" action={<Button variant="quiet" onClick={askAI}>다시 시도</Button>}>
        판정 서버가 쉬는 중입니다. 기록을 먼저 저장해 두면 서버가 돌아올 때 이어서 판정합니다.
      </Banner>
    )
  }

  if (ask === 'running') {
    return (
      <div className="ask-running">
        <ol className="steps">
          {IDENTIFY_STEPS.map((text, i) => (
            <li key={text} className={i < askStep ? 'is-done' : i === askStep ? 'is-now' : ''}>
              <span className="step-dot">{i < askStep && <Icon name="check" size={12} />}</span>{text}
            </li>
          ))}
        </ol>
        <p className="hint">1~2분 걸릴 수 있습니다. 기다리지 않고 저장해도 판정은 이어집니다.</p>
        {/* 중단: 몇 분씩 걸리는 작업에는 빠져나올 길이 있어야 한다 */}
        <Button variant="quiet" icon="stop" onClick={cancelAsk}>중단</Button>
      </div>
    )
  }

  if (ask === 'done' && verdict) {
    const applied = name === verdict.speciesKo
    return (
      <div className="verdict">
        <p className="verdict-kind"><Icon name="sparkle" size={16} /> AI 판정 · {verdict.kind}</p>
        <h3 className="display">{verdict.speciesKo} <em>{verdict.latin}</em></h3>
        <p>{verdict.summary}</p>
        {/* 근거는 버튼이 아니라 펼침이다 — 결과를 믿을지 판단하는 재료라 늘 가까이 있어야 한다 */}
        <details>
          <summary>근거 {verdict.evidence.length}개 보기</summary>
          <ul>{verdict.evidence.map((e) => <li key={e.text}>{e.text}<small>{e.source}</small></li>)}</ul>
        </details>
        {applied
          ? <p className="status-line is-ok"><Icon name="check" size={16} /> 이름 칸에 넣었습니다</p>
          // 이 이름으로: 사용자가 이미 적은 이름을 말없이 덮어쓰지 않으려고 누르게 한다
          : <Button variant="secondary" icon="check" onClick={applyVerdict}>이 이름으로</Button>}
      </div>
    )
  }

  return (
    <div className="ask-idle">
      {/* AI에게 물어보기: 오래 걸리고 서버 자원(또는 사용자의 API 요금)을 쓰므로 자동으로 돌리지 않는다 */}
      <Button variant="secondary" icon="sparkle" onClick={askAI} disabled={crop === null}>AI에게 물어보기</Button>
      {crop === null && <p className="hint">판정할 새를 먼저 고르세요.</p>}
    </div>
  )
}
