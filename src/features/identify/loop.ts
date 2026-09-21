import type { Verdict } from '../../types'
import type { OwnKey } from './connection'
import { chat, type ChatMessage } from './llmClient'
import { parseVerdict } from './parseVerdict'
import { SYSTEM_PROMPT, WRAP_UP_PROMPT, userPrompt } from './prompts'
import { runTool, toolSchemas } from './tools'

/** LLM에 보내는 그림의 긴 변. 더 크면 그림 토큰만 늘고 판정은 나아지지 않는다 (v1 MAX_IMAGE_EDGE와 같다) */
export const IDENTIFY_MAX_EDGE = 1024
/** 도구를 부를 수 있는 횟수. 넘으면 지금까지의 근거로 답하게 한다 */
const MAX_TOOL_CALLS = 8

/** 진행 상황. 화면이 단계 목록으로 그린다 */
export type IdentifyEvent =
  | { type: 'thinking'; text: string }
  | { type: 'tool'; name: string; args: Record<string, unknown> }
  | { type: 'wrap-up' }

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
 * 답을 읽을 수 없으면 null. 서버에 닿지 못하면 LlmUnavailableError, `signal`로 중단하면 AbortError가 올라간다.
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
  let calls = 0
  for (;;) {
    const wrapUp = calls >= MAX_TOOL_CALLS
    if (wrapUp) { messages.push({ role: 'user', content: WRAP_UP_PROMPT }); opts.onEvent({ type: 'wrap-up' }) }
    const reply = await chat(opts.own, messages, tools, wrapUp ? 'none' : 'auto', opts.signal, (text) => opts.onEvent({ type: 'thinking', text }))
    if (reply.toolCalls.length === 0 || wrapUp) return parseVerdict(reply.content, reply.model)

    // 모델의 답을 그대로 대화에 남긴다 — 안 남기면 다음 요청에서 도구 결과가 어느 호출의 것인지 짝을 지을 수 없다
    messages.push({ role: 'assistant', content: reply.content || null, tool_calls: reply.toolCalls })
    for (const call of reply.toolCalls) {
      const args = parseArgs(call.function.arguments)
      opts.onEvent({ type: 'tool', name: call.function.name, args })
      const result = await runTool(call.function.name, args)
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) })
      calls += 1
    }
  }
}
