import { useEffect, useState } from 'react'
import { Banner } from '../../ui/bits'
import Button from '../../ui/Button'
import Icon from '../../ui/Icon'
import type { Verdict } from '../../types'
import VerdictDetails from '../identify/VerdictDetails'
import type { AskState } from './useAsk'

/** 기본 제공 AI가 이보다 오래 조용하면 "앞 순서를 기다리는 중일 수 있습니다"를 덧붙인다 — 여럿이 한 서버를 쓴다 */
const QUEUE_HINT_AFTER_MS = 30_000

interface Props {
  ask: { state: AskState; steps: string[]; verdict: Verdict | null; message: string; own: boolean; startedAt: number | null; cancel: () => void }
  /** 자를 영역을 골랐는지. 안 골랐어도 물어볼 수 있다 — 그때는 사진 전체가 간다 */
  hasCrop: boolean
  /** 결과가 나온 뒤 영역이 바뀌었는지 — 다시 물어볼 이유가 생겼다고 알려 준다 */
  cropChanged?: boolean
  /** 지금 이름 칸의 값 — 결과를 이미 넣었는지 보려고 */
  name: string
  /** 시작 전 안내를 바꿔 쓴다 (저장된 기록에서는 자를 수 없다). 없으면 기본 문구 */
  idleHint?: string
  onAsk: () => void
  onApply: (v: Verdict) => void
  /** '좁힘'의 남은 후보를 눌렀을 때 — 그 이름이 이름 칸에 들어간다 */
  onPickName: (name: string) => void
  /** 기본 제공 AI가 쉴 때 "설정에서 내 키 넣기"로 가는 길. 없으면 글로만 안내한다 */
  onOpenSettings?: () => void
}

/** 시작 시각부터 지난 시간을 1초마다 다시 센다. '0분 42초' */
function useElapsed(startedAt: number | null): { text: string; ms: number } {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (startedAt === null) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [startedAt])
  const ms = startedAt === null ? 0 : Math.max(0, now - startedAt)
  const sec = Math.floor(ms / 1000)
  return { text: `${Math.floor(sec / 60)}분 ${String(sec % 60).padStart(2, '0')}초`, ms }
}

/**
 * AI 종 판정. 시작 전 · 진행 중 · 결과 · 실패의 네 모습을 가진다. 기록하기와 기록 상세 두 곳에서 같은 것을 쓴다.
 * v1에 있던 provider·모델·최대 호출 수·시간 제한 입력은 없다 — 사용자가 정할 것은 "내 키를 쓸지"뿐이고 그건 설정에 있다.
 */
export default function IdentifyPanel({ ask, hasCrop, cropChanged, name, idleHint, onAsk, onApply, onPickName, onOpenSettings }: Props) {
  const elapsed = useElapsed(ask.state === 'running' ? ask.startedAt : null)
  if (ask.state === 'server-down') {
    return (
      // 다시 시도: 서버가 돌아온 걸 사용자가 먼저 알 수도 있다. 문구는 서버가 보낸 이유를 그대로 쓴다 (llmClient.ts)
      <Banner tone="warn" icon="alert" action={
        <div className="row-actions">
          {/* 설정에서 내 키 넣기: 기본 제공 AI가 막혔을 때 지금 당장 되는 유일한 길. 쓰던 기록은 초안으로 남으므로 화면을 떠나도 안전하다 */}
          {!ask.own && onOpenSettings && <Button variant="quiet" icon="gear" onClick={onOpenSettings}>설정에서 내 키 넣기</Button>}
          <Button variant="quiet" onClick={onAsk}>다시 시도</Button>
        </div>
      }>
        {ask.message || '판정 서버가 쉬는 중입니다.'} 이름 없이 먼저 저장해 두고 나중에 기록을 열어 다시 물어볼 수 있습니다.
        {!ask.own && !onOpenSettings && ' 설정 › AI 종 판정에서 내 API 키를 넣으면 바로 판정할 수 있습니다.'}
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
        <p className="hint">진행 중 · {elapsed.text} — 1~2분 걸릴 수 있습니다.</p>
        {!ask.own && elapsed.ms > QUEUE_HINT_AFTER_MS && <p className="hint">기본 제공 AI는 여럿이 함께 씁니다 — 앞 순서를 기다리는 중일 수 있습니다.</p>}
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
        {v.others.length > 0 && (
          <div className="verdict-others">
            <p className="hint">남은 후보 — 누르면 이름 칸에 들어갑니다</p>
            {/* 후보 칩: '좁힘'에서 사용자가 눈으로 가려낸 후보를 다시 타이핑하지 않게 */}
            <div className="chips">{v.others.map((o) => <button key={o} type="button" className={`chip${name === o ? ' is-on' : ''}`} onClick={() => onPickName(o)}>{o}</button>)}</div>
          </div>
        )}
        {/* 근거는 버튼이 아니라 펼침이다 — 결과를 믿을지 판단하는 재료라 늘 가까이 있어야 한다 */}
        <VerdictDetails verdict={v} />
        {cropChanged && <p className="status-line is-warn">자른 영역이 바뀌었습니다 — 다시 물어볼 수 있습니다.</p>}
        <div className="row-actions">
          {applied
            ? <p className="status-line is-ok"><Icon name="check" size={16} /> 이름 칸에 넣었습니다</p>
            // 이 이름으로: 사용자가 이미 적은 이름을 말없이 덮어쓰지 않으려고 누르게 한다
            : <Button icon="check" onClick={() => onApply(v)}>이 이름으로</Button>}
          {/* 다시 물어보기: 영역을 고친 뒤(또는 답이 미심쩍을 때) 다시 물을 유일한 길 */}
          <Button variant="quiet" icon="sparkle" onClick={onAsk}>다시 물어보기</Button>
        </div>
      </div>
    )
  }
  return (
    <div className="ask-idle">
      {/* AI에게 물어보기: 오래 걸리고 서버 자원(또는 사용자의 API 요금)을 쓰므로 자동으로 돌리지 않는다 */}
      <Button icon="sparkle" onClick={onAsk}>AI에게 물어보기</Button>
      {/* 자르지 않아도 보낼 수 있다. 다만 새가 작게 찍힌 사진은 잘라 보내야 잘 맞는다는 것을 알려 준다 */}
      {idleHint !== undefined
        ? idleHint && <p className="hint">{idleHint}</p>
        : !hasCrop && <p className="hint">자르지 않으면 사진 전체를 보냅니다. 새가 작게 찍혔다면 잘라서 보내는 편이 정확합니다.</p>}
    </div>
  )
}
