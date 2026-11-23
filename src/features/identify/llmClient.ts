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
 * `error`가 든 줄이 오면 LlmUnavailableError — 기본 제공 AI는 답을 보내다 멈추면 이 줄로 알린다 (`api/_lib/llmStream.ts STALL_EVENT`).
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
      let event: { error?: { message?: unknown } | string; choices?: Array<{ delta?: { content?: string; tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }> } }> } | null
      try { event = JSON.parse(data) } catch { continue }
      // 오류 번호는 이미 200으로 나간 뒤라 스트림 안에 적혀 온다. 서비스에 따라 글자 하나로 오기도 한다
      if (event?.error) {
        const reason = typeof event.error === 'string' ? event.error : event.error.message
        throw new LlmUnavailableError(String(reason ?? '') || '답을 받다가 멈췄습니다. 잠시 뒤 다시 시도해 주세요.')
      }
      const delta = event?.choices?.[0]?.delta
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

/** 일반 모델에 주는 temperature. 같은 사진에 답이 덜 흔들리게 낮춘다 (기본 제공 AI는 서버가 정한다 — api/_lib/llmRequest.ts) */
const OWN_TEMPERATURE = 0.2
/** temperature를 거절한 내 키의 서비스·모델 — 이 탭이 열려 있는 동안 기억해, 판정의 턴마다 한 번씩 거절당하지 않게 한다 */
const noTemperature = new Set<string>()

/**
 * 거절 응답이 temperature 때문인지 본다. OpenAI의 추론 모델(o3·o4-mini·gpt-5 계열 등)은 기본값(1)이 아닌 temperature를
 * 400으로 거절한다 ("Unsupported value: 'temperature' does not support 0.2 with this model …"). 다른 400은 false.
 */
function rejectsTemperature(status: number, message: string): boolean {
  return status === 400 && /temperature/i.test(message)
}

/** 실패 응답 본문의 OpenAI 형식 안내(`error.message`). JSON이 아니거나 비었으면 빈 글자 */
function errorMessage(res: Response): Promise<string> {
  return res.json().then((j) => String(j?.error?.message ?? ''), () => '')
}

/**
 * 요청 하나를 보낸다. 사용자가 멈췄으면 그 오류(AbortError)를 그대로, 서버에 닿지 못하면 LlmUnavailableError를 던진다.
 * 응답 번호는 보지 않는다 (부르는 쪽이 본다).
 */
async function post(own: OwnKey | null, payload: Record<string, unknown>, signal: AbortSignal): Promise<Response> {
  const target = endpointFor(own)
  try {
    return await fetch(target.url, { method: 'POST', headers: { 'content-type': 'application/json', ...target.headers }, body: JSON.stringify(payload), signal })
  } catch (e) {
    if (signal.aborted) throw e
    // 내 키 요청은 우리 서버를 거치지 않는다 — "판정 서버"라고 하면 사용자가 엉뚱한 곳을 의심한다
    throw new LlmUnavailableError(own
      ? '내 API 키의 서비스에 닿지 못했습니다 — 설정에서 주소를 확인해 주세요. 브라우저에서 직접 부르는 것을 막는 서비스일 수도 있습니다.'
      : '판정 서버에 닿지 못했습니다.')
  }
}

/**
 * LLM에 한 턴을 보낸다. `toolChoice`가 'none'이어도 **도구 정의는 그대로 보낸다** —
 * 정의를 빼면 요청의 앞부분이 달라져 서버의 KV 캐시가 통째로 무효가 된다 (v1에서 확인한 함정).
 * 내 키 요청에는 temperature 0.2를 싣되, 그 서비스가 temperature를 400으로 거절하면(추론 모델) 빼고 **한 번만** 다시 보내고
 * 그 모델에는 이 탭이 열려 있는 동안 싣지 않는다. 기본 제공 AI 요청에는 싣지 않는다 (서버가 정한다).
 * 서버에 닿지 못하거나 502/503이면 LlmUnavailableError, 기본 제공 AI가 요청 제한(429)에 걸려도 LlmUnavailableError,
 * 답을 받다가 끊기거나 스트림에 오류 줄이 와도 LlmUnavailableError, 그 밖의 실패는 서버가 준 안내와 함께 Error.
 */
export async function chat(own: OwnKey | null, messages: ChatMessage[], tools: unknown[], toolChoice: 'auto' | 'none', signal: AbortSignal, onText: (soFar: string) => void): Promise<ChatReply> {
  const target = endpointFor(own)
  const base = { messages, tools, tool_choice: toolChoice, stream: true, ...(own ? { model: own.model } : {}) }
  const modelKey = own ? `${own.baseUrl} ${own.model}` : ''
  const withTemperature = own !== null && !noTemperature.has(modelKey)
  let res = await post(own, withTemperature ? { ...base, temperature: OWN_TEMPERATURE } : base, signal)
  let message = res.ok && res.body ? '' : await errorMessage(res)
  if (withTemperature && rejectsTemperature(res.status, message)) {
    noTemperature.add(modelKey)
    res = await post(own, base, signal)
    message = res.ok && res.body ? '' : await errorMessage(res)
  }
  if (!res.ok || !res.body) {
    // 기본 제공 AI의 429는 둘이다. 우리 함수의 전체 상한(`api/_lib/llmQuota.ts`)은 `x-llm-limit` 머리말과 이유를 준다 —
    // "오늘 시간을 다 씀"과 "잠깐 붐빔"은 다시 물을 때가 달라 그 안내를 쓴다. Vercel Firewall의 요청 제한은 본문이 우리 JSON이 아니어서 안내를 여기서 정한다.
    // 내 키의 429(그 서비스의 한도·요금)는 그 서비스가 준 안내를 아래에서 그대로 쓴다
    if (res.status === 429 && !own) throw new LlmUnavailableError((res.headers.has('x-llm-limit') && message) || '요청이 많아 잠시 쉬어 갑니다. 몇 분 뒤 다시 물어봐 주세요.')
    if (res.status === 502 || res.status === 503) throw new LlmUnavailableError(message || '판정 서버가 쉬는 중입니다.')
    throw new Error(message || `판정 요청이 실패했습니다 (${res.status}).`)
  }
  const reply = await readStream(res.body, onText).catch((e: unknown) => {
    if (signal.aborted || e instanceof LlmUnavailableError) throw e
    // 답을 받다가 연결이 끊겼다 (함수 시간 초과·네트워크) — 브라우저의 영어 'network error' 대신 다시 하면 되는 실패로
    throw new LlmUnavailableError(own ? '내 API 키의 서비스와 연결이 끊겼습니다. 잠시 뒤 다시 시도해 주세요.' : '판정 서버와 연결이 끊겼습니다. 잠시 뒤 다시 물어봐 주세요.')
  })
  return { ...reply, model: res.headers.get('x-llm-model') ?? target.model }
}
