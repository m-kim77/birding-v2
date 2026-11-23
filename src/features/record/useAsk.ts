import { useEffect, useRef, useState } from 'react'
import type { Verdict } from '../../types'
import { loadOwnKey } from '../identify/connection'
import { LlmUnavailableError } from '../identify/llmClient'
import { runIdentify, type IdentifyEvent } from '../identify/loop'

export type AskState = 'idle' | 'running' | 'done' | 'server-down' | 'failed'

/** 보낼 그림을 만들 수 없는 이유를 사용자 말로 알릴 때 던진다 (예: 기록의 사진이 없다). 그 밖의 오류는 정해 둔 안내로 바꾼다 */
export class AskImageError extends Error {}

/** 진행 단계 한 줄. 도구 호출을 사람의 말로 옮긴 것 */
function stepText(e: IdentifyEvent): string | null {
  if (e.type === 'wrap-up') return '지금까지의 근거로 답을 정리하는 중'
  if (e.type !== 'tool') return null
  const what = String(e.args.query ?? e.args.title ?? e.args.scientific_name ?? '')
  if (e.name === 'search_wikipedia') return `자료를 찾는 중 — "${what}"`
  if (e.name === 'read_wikipedia') return `자료를 읽는 중 — ${what}`
  if (e.name === 'lookup_korean_name') return `한국어 이름을 확인하는 중 — ${what}`
  return `${e.name} 실행 중`
}

/**
 * AI 종 판정의 상태. 시작·중단과, 진행 단계 목록을 든다.
 * 서버에 닿지 못한 것(server-down)과 답을 읽지 못한 것(failed)을 구분한다 — 앞의 것은 나중에 다시 하면 되고, 뒤의 것은 다시 해도 같을 수 있다.
 * 화면을 떠나면 돌고 있던 판정을 중단한다.
 */
export function useAsk() {
  const [state, setState] = useState<AskState>('idle')
  const [steps, setSteps] = useState<string[]>([])
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [message, setMessage] = useState('')
  // 이번 판정이 내 키로 갔는지 — 안내 문구가 다르다 (기본 제공 AI가 막혔을 때만 "설정에서 내 키"를 권한다)
  const [own, setOwn] = useState(false)
  // 판정을 시작한 시각(ms). 화면이 "진행 중 · 0분 42초"와 "앞 순서를 기다리는 중일 수 있습니다"를 그리는 재료
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const abort = useRef<AbortController | null>(null)
  useEffect(() => () => abort.current?.abort(), [])

  /**
   * 판정을 시작한다. 오래 걸리고 서버 자원(또는 사용자의 API 요금)을 쓰므로 자동으로 부르지 않는다.
   * 보낼 그림은 `makeImage`가 여기서 만든다 — 원본을 다시 디코드해 폰에서 0.5~1초 걸리는데, 그동안 이미 '진행 중'이라
   * 'AI에게 물어보기'가 숨어 두 번 누를 수 없다. 그림을 못 만들면 '실패'(AskImageError면 그 안내)로 끝난다. 던지지 않는다.
   * 판정마다 제 중단 신호를 든다: 새 판정·중단·사진 바꾸기·되살리기로 밀려난 판정의 결과·오류·단계는 버린다
   * (밀어낸 쪽이 상태를 이미 정했다 — 여기서 '실패'나 '시작 전'으로 덮으면 새 판정이 가려진다).
   */
  async function start(makeImage: () => Promise<string>, context: { capturedAt?: string; place?: string }) {
    abort.current?.abort()
    const ctrl = new AbortController()
    abort.current = ctrl
    // 이 판정이 아직 화면의 판정인지 — 아니면 늦게 온 결과·오류·단계를 버린다
    const current = () => abort.current === ctrl && !ctrl.signal.aborted
    setState('running')
    setStartedAt(Date.now())
    setSteps(['보낼 그림을 준비하는 중'])
    setVerdict(null)
    const key = loadOwnKey()
    setOwn(key !== null)
    let imageDataUrl: string
    try {
      imageDataUrl = await makeImage()
    } catch (e) {
      if (!current()) return
      setMessage(e instanceof AskImageError ? e.message : '보낼 그림을 만들지 못했습니다. 다시 시도해 보세요.')
      setState('failed')
      return
    }
    if (!current()) return
    setSteps((list) => [...list, '사진에서 특징을 살펴보는 중'])
    try {
      const result = await runIdentify({
        imageDataUrl, context, own: key, signal: ctrl.signal,
        onEvent: (e) => { const text = stepText(e); if (text && current()) setSteps((list) => [...list, text]) },
      })
      if (!current()) return
      if (result) { setVerdict(result); setState('done') } else { setMessage('AI의 답을 읽지 못했습니다. 다시 시도해 보세요.'); setState('failed') }
    } catch (e) {
      if (!current()) return
      // 서버가 보낸 이유("아직 설정되지 않았습니다" 등)를 버리지 않는다 — "쉬는 중"과 "영영 안 됨"은 사용자가 할 일이 다르다
      if (e instanceof LlmUnavailableError) { setMessage(e.message); setState('server-down'); return }
      setMessage(e instanceof Error ? e.message : '판정에 실패했습니다.')
      setState('failed')
    }
  }

  /** 진행 중인 판정을 멈추고 결과를 비운다. 몇 분씩 걸릴 수 있어 빠져나올 길이 있어야 하고, 사진을 바꿀 때는 옛 결과가 남으면 안 된다 */
  function cancel() {
    abort.current?.abort()
    setVerdict(null)
    setState('idle')
  }

  /**
   * 끝난 판정을 밖에서 넣는다 (되살린 초안의 판정). 돌고 있던 것이 있으면 멈춘다.
   * 진행 단계 목록은 비운다 — 그 판정이 어떤 도구를 거쳤는지는 남기지 않았다.
   */
  function restore(v: Verdict) {
    abort.current?.abort()
    setVerdict(v)
    setSteps([])
    setMessage('')
    setState('done')
  }

  return { state, steps, verdict, message, own, startedAt, start, cancel, restore }
}
