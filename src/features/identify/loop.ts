import type { Reference, Verdict } from '../../types'
// node --test가 이 파일을 읽는다 (test/identifyLoop.test.ts) — 확장자를 적는다
import { SPECIES } from '../../data/species.ts'
import type { OwnKey } from './connection'
import { koNamesIn } from './koName.ts'
import { chat, type ChatMessage } from './llmClient.ts'
import { parseVerdict } from './parseVerdict.ts'
import { RETRY_PROMPT, SYSTEM_PROMPT, WRAP_UP_PROMPT, userPrompt } from './prompts.ts'
import { runTool, toolSchemas } from './tools/index.ts'

/** LLM에 보내는 그림의 긴 변. 더 크면 그림 토큰만 늘고 판정은 나아지지 않는다 (v1 MAX_IMAGE_EDGE와 같다) */
export const IDENTIFY_MAX_EDGE = 1024
/** 도구를 부를 수 있는 횟수. 넘으면 지금까지의 근거로 답하게 한다 */
const MAX_TOOL_CALLS = 8

/** 진행 상황. 화면이 단계 목록으로 그린다 */
export type IdentifyEvent =
  | { type: 'thinking'; text: string }
  | { type: 'tool'; name: string; args: Record<string, unknown> }
  | { type: 'wrap-up' }

/**
 * 도구 결과에 자료의 주소가 있으면 참고 자료로 모은다. 같은 주소는 한 번만.
 * 도구가 실제로 돌려준 값만 쓴다 — 모델의 답에 적힌 주소는 믿지 않는다 (지어낼 수 있다).
 */
function collectReference(found: Reference[], result: unknown): void {
  const r = result as { title?: unknown; url?: unknown; image?: unknown } | null
  if (typeof r?.url !== 'string' || typeof r.title !== 'string' || found.some((f) => f.url === r.url)) return
  found.push({ title: r.title, url: r.url, image: typeof r.image === 'string' ? r.image : undefined })
}

/**
 * 중단된 신호면 던진다 (`signal.throwIfAborted`와 같다). 그 함수는 iOS 15.4부터라 직접 쓰지 않는다.
 * 이유(reason)가 없으면(iOS 15.0~15.3) 이름이 AbortError인 DOMException을 던진다.
 */
function stopIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw signal.reason ?? new DOMException('판정을 멈췄습니다.', 'AbortError')
}

/** 도구 인자 글자를 읽는다. 모델이 깨진 JSON을 낼 때가 있다 — 빈 인자로 넘기면 도구가 오류를 결과로 돌려준다 */
function parseArgs(text: string): Record<string, unknown> {
  try { const v = JSON.parse(text || '{}'); return v && typeof v === 'object' ? v : {} } catch { return {} }
}

/**
 * 판정 한 건을 끝까지 돌린다: 모델에게 묻고 → 모델이 부른 도구를 실행해 결과를 돌려주고 → 최종 답이 나올 때까지 되풀이한다.
 *
 * 대화는 **뒤에 덧붙이기만 한다** (앞부분을 고치지 않는다). LLM 서버의 KV 캐시는 직전 요청과 앞부분이 같을 때만
 * 다시 쓰이므로, 이 규칙이 턴마다의 대기 시간을 좌우한다.
 *
 * 답을 읽을 수 없으면 null. 서버에 닿지 못하면 LlmUnavailableError, `signal`로 중단하면 AbortError가 올라간다
 * (도구를 하나 돌리기 전마다 중단됐는지 본다 — 멈춘 판정이 위키백과를 마저 읽느라 도구마다 몇 초씩 더 돌지 않게).
 */
export async function runIdentify(opts: {
  imageDataUrl: string
  context: { capturedAt?: string; place?: string }
  own: OwnKey | null
  signal: AbortSignal
  onEvent: (e: IdentifyEvent) => void
}): Promise<Verdict | null> {
  const tools = toolSchemas()
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: [{ type: 'text', text: userPrompt(opts.context) }, { type: 'image_url', image_url: { url: opts.imageDataUrl } }] },
  ]
  const references: Reference[] = []
  // 국명으로 받아들일 이름: 종 표의 이름 + 이번 판정에서 도구가 돌려준 이름. 모델이 지어낸 이름은 여기에 없다 (작업 20)
  const knownKo = new Set(SPECIES.map((s) => s.ko))
  let calls = 0
  let retried = false
  for (;;) {
    const wrapUp = calls >= MAX_TOOL_CALLS
    if (wrapUp && !retried) { messages.push({ role: 'user', content: WRAP_UP_PROMPT }); opts.onEvent({ type: 'wrap-up' }) }
    const reply = await chat(opts.own, messages, tools, wrapUp ? 'none' : 'auto', opts.signal, (text) => opts.onEvent({ type: 'thinking', text }))
    if (reply.toolCalls.length === 0 || wrapUp) {
      const verdict = parseVerdict(reply.content, reply.model, knownKo)
      if (verdict) return { ...verdict, references }
      // 답을 읽지 못했다 — 생각하는 모델이 토큰 상한을 생각에 다 써서 답이 비는 일이 실제로 있었다. 한 번만 다시 청한다
      if (retried) return null
      retried = true
      messages.push({ role: 'assistant', content: reply.content || '(답 없음)' }, { role: 'user', content: RETRY_PROMPT })
      calls = MAX_TOOL_CALLS
      continue
    }

    // 모델의 답을 그대로 대화에 남긴다 — 안 남기면 다음 요청에서 도구 결과가 어느 호출의 것인지 짝을 지을 수 없다
    messages.push({ role: 'assistant', content: reply.content || null, tool_calls: reply.toolCalls })
    for (const call of reply.toolCalls) {
      const args = parseArgs(call.function.arguments)
      opts.onEvent({ type: 'tool', name: call.function.name, args })
      stopIfAborted(opts.signal)
      const result = await runTool(call.function.name, args)
      collectReference(references, result)
      for (const name of koNamesIn(result)) knownKo.add(name)
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) })
      calls += 1
    }
  }
}
