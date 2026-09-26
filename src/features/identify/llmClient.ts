// node --test가 읽는다 (test/llmClient.test.ts) — 확장자를 적는다
import { endpointFor, type OwnKey } from './connection.ts'

/** OpenAI 형식의 메시지. 내용은 글자이거나(도구·조수) 글자+그림 조각 배열(사용자)이다 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | Array<Record<string, unknown>> | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
}
export interface ToolCall { id: string; type: 'function'; function: { name: string; arguments: string } }
export interface ChatReply { content: string; toolCalls: ToolCall[]; model: string }

/**
 * 잠시 뒤 다시 하면 되는 실패 — 서버가 쉬거나, 닿지 않거나, 바쁘거나, 요청 제한에 걸렸을 때.
 * 화면은 이 안내와 함께 '다시 시도'(기본 제공 AI면 '설정에서 내 키 넣기'도)를 보여 준다.
 */
export class LlmUnavailableError extends Error {}

/**
 * 스트림(SSE)으로 오는 조각을 모아 하나의 답으로 만든다. 도구 호출은 index별로 이름·인자가 조각조각 온다.
 * `onText`는 글자가 늘 때마다 지금까지의 글 전체를 받는다 (진행 상황 표시용).
 */
async function readStream(body: ReadableStream<Uint8Array>, onText: (soFar: string) => void): Promise<{ content: string; toolCalls: ToolCall[] }> {
  // 타입 정의가 TextDecoderStream의 입력을 BufferSource로 넓게 잡아 pipeThrough와 어긋난다 — 실제 동작은 맞다
  const reader = body.pipeThrough(new TextDecoderStream() as unknown as TransformStream<Uint8Array, string>).getReader()
  const calls: ToolCall[] = []
  let content = ''
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += value
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (!data || data === '[DONE]') continue
      let delta: { content?: string; tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }> } | undefined
      try { delta = JSON.parse(data).choices?.[0]?.delta } catch { continue }
      if (delta?.content) { content += delta.content; onText(content) }
      for (const part of delta?.tool_calls ?? []) {
        const call = (calls[part.index] ??= { id: '', type: 'function', function: { name: '', arguments: '' } })
        if (part.id) call.id = part.id
        if (part.function?.name) call.function.name += part.function.name
        if (part.function?.arguments) call.function.arguments += part.function.arguments
      }
    }
  }
  return { content, toolCalls: calls.filter(Boolean) }
}

/**
 * LLM에 한 턴을 보낸다. `toolChoice`가 'none'이어도 **도구 정의는 그대로 보낸다** —
 * 정의를 빼면 요청의 앞부분이 달라져 서버의 KV 캐시가 통째로 무효가 된다 (v1에서 확인한 함정).
 * 서버에 닿지 못하거나 502/503이면 LlmUnavailableError, 기본 제공 AI가 요청 제한(429)에 걸려도 LlmUnavailableError,
 * 그 밖의 실패는 서버가 준 안내와 함께 Error.
 */
export async function chat(own: OwnKey | null, messages: ChatMessage[], tools: unknown[], toolChoice: 'auto' | 'none', signal: AbortSignal, onText: (soFar: string) => void): Promise<ChatReply> {
  const target = endpointFor(own)
  const payload = { messages, tools, tool_choice: toolChoice, stream: true, ...(own ? { model: own.model, temperature: 0.2 } : {}) }
  let res: Response
  try {
    res = await fetch(target.url, { method: 'POST', headers: { 'content-type': 'application/json', ...target.headers }, body: JSON.stringify(payload), signal })
  } catch (e) {
    if (signal.aborted) throw e
    // 내 키 요청은 우리 서버를 거치지 않는다 — "판정 서버"라고 하면 사용자가 엉뚱한 곳을 의심한다
    throw new LlmUnavailableError(own
      ? '내 API 키의 서비스에 닿지 못했습니다 — 설정에서 주소를 확인해 주세요. 브라우저에서 직접 부르는 것을 막는 서비스일 수도 있습니다.'
      : '판정 서버에 닿지 못했습니다.')
  }
  if (!res.ok || !res.body) {
    // 기본 제공 AI의 429는 Vercel Firewall의 요청 제한이다 — 본문이 우리 JSON이 아니어서 안내를 여기서 정한다.
    // 내 키의 429(그 서비스의 한도·요금)는 그 서비스가 준 안내를 아래에서 그대로 쓴다
    if (res.status === 429 && !own) throw new LlmUnavailableError('요청이 많아 잠시 쉬어 갑니다. 몇 분 뒤 다시 물어봐 주세요.')
    const message = await res.json().then((j) => String(j?.error?.message ?? ''), () => '')
    if (res.status === 502 || res.status === 503) throw new LlmUnavailableError(message || '판정 서버가 쉬는 중입니다.')
    throw new Error(message || `판정 요청이 실패했습니다 (${res.status}).`)
  }
  const reply = await readStream(res.body, onText)
  return { ...reply, model: res.headers.get('x-llm-model') ?? target.model }
}
