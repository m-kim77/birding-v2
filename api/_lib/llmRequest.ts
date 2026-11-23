/**
 * 기본 제공 AI로 가는 요청을 검사하고, LLM 서버로 보낼 본문을 만든다. 순수 함수다 (`test/llmRequest.test.ts`).
 * `api/llm.ts`가 쓴다. `api/` 안이라도 `_`로 시작하는 폴더는 Vercel이 함수(주소)로 만들지 않는다.
 *
 * **지시문(시스템 프롬프트)과 도구는 서버가 정한다.** 브라우저가 보낸 것은 버리고 앱의 것을 넣는다 —
 * 저장소가 공개라 요청 모양이 알려져 있고, 그대로 넘기면 누구나 운영자의 LLM을 아무 일에나 시키는 챗봇으로 쓸 수 있다.
 * 앱이 보내던 것과 같은 글이 같은 순서로 실리므로 LLM 서버의 KV 캐시는 전과 같다.
 * **대화도 앱의 판정 모양만 받는다** (`_lib/llmConversation.ts`) — 지시문을 바꿔 넣어도 그림 없이 글만 보내면 맥이 그 일을 했다.
 * 다만 이 두 검사는 손쉬운 챗봇 사용만 막는다. 저장소를 읽은 사람은 앱 모양 안에 지시를 끼울 수 있고, 남용은 요청 수 제한이 맡는다.
 *
 * 이 파일(과 이 파일이 부르는 파일)의 import 경로에는 `.ts`를 적는다 — 확장자 없는 경로는 배포된 함수에서 못 찾아
 * 함수가 아예 뜨지 않는다 (tsconfig `rewriteRelativeImportExtensions`가 `.ts`를 배포용 `.js`로 바꿔 준다).
 */
import { SYSTEM_PROMPT } from '../../src/features/identify/prompts.ts'
import { toolSchemas } from '../../src/features/identify/tools/definitions.ts'
import { conversationError } from './llmConversation.ts'

/**
 * 대화에 실을 수 있는 메시지 수. 앱의 판정 한 건은 많아야 스무 개 남짓이다
 * (지시문·사진 + 도구 8회(`loop.ts MAX_TOOL_CALLS`)의 부름과 결과 + 마무리 + 다시 청하기). `MAX_TOOL_CALLS`를 늘리면 이 값도 본다.
 */
export const MAX_MESSAGES = 40

/** 서버가 정하는 값 (환경변수에서 온다) */
export interface ServerSettings {
  model: string
  /** 한 턴의 토큰 상한 — 생각(reasoning) 토큰도 여기에 든다 */
  maxTokens: number
  /** 생각 세기(`reasoning_effort`). null이면 보내지 않는다 — LLM 서버의 기본값을 쓴다 */
  reasoningEffort: string | null
}

/** 보낼 수 있는 생각 세기. Unsloth의 Qwen3.8 Flash가 받는 값이다 (작업 21에서 서버 기록으로 확인) */
export const REASONING_EFFORTS = ['low', 'medium', 'high', 'xhigh']

/**
 * 생각 세기의 기본값. 작업 21 시험(사진 5장 × 2회)에서 서버 기본(high)보다 평균 86초 → 53초로 빨랐고,
 * 맞힌 수는 줄지 않았으며(6 → 8/10), high에서 생긴 "생각이 상한에 잘려 답이 깨짐"이 없었다.
 */
export const DEFAULT_REASONING_EFFORT = 'low'

/**
 * 환경변수 값(`LOCAL_LLM_REASONING_EFFORT`)을 보낼 생각 세기로 바꾼다. 대소문자·앞뒤 빈칸은 무시한다.
 * 비었거나 목록에 없는 값이면 기본값(low) — 잘못 적은 값 때문에 느린 서버 기본으로 조용히 돌아가지 않게.
 * 'server'면 null(보내지 않음) — 이 옵션을 모르는 서버로 바꿨을 때 끄는 길이다.
 */
export function reasoningEffortOf(value: string | undefined): string | null {
  const v = (value ?? '').trim().toLowerCase()
  if (v === 'server') return null
  return REASONING_EFFORTS.includes(v) ? v : DEFAULT_REASONING_EFFORT
}

/** 검사 결과: LLM 서버로 보낼 본문, 또는 브라우저에 돌려줄 한국어 안내 (→ 400) */
export type LlmRequest = { payload: Record<string, unknown> } | { error: string }

const BAD_FORMAT = '요청 형식이 잘못되었습니다.'
/** 받는 역할. system은 받되 버린다 — 서버의 지시문을 맨 앞에 넣는다 */
const ROLES = new Set(['system', 'user', 'assistant', 'tool'])

/**
 * 브라우저가 보낸 본문(OpenAI chat.completions 형식)으로 LLM 서버에 보낼 본문을 만든다.
 * 지시문·도구·모델·토큰 상한·온도·생각 세기는 서버의 것으로 바꾸고, 대화에서는 system이 아닌 메시지만 넘긴다.
 * 메시지가 `MAX_MESSAGES`개를 넘거나, `tool_choice`가 auto·none(없으면 auto)이 아니거나, 메시지 모양이 틀리거나,
 * 대화가 앱의 판정 모양이 아니면(그림 없음·두 장·엉뚱한 사용자 글 등, `llmConversation.ts`) `{ error }`를 준다.
 */
export function buildLlmRequest(body: unknown, settings: ServerSettings): LlmRequest {
  if (!isRecord(body) || !Array.isArray(body.messages)) return { error: BAD_FORMAT }
  if (body.messages.length > MAX_MESSAGES) return { error: '대화가 너무 깁니다. 처음부터 다시 물어봐 주세요.' }
  const toolChoice = body.tool_choice ?? 'auto'
  if (toolChoice !== 'auto' && toolChoice !== 'none') return { error: BAD_FORMAT }

  const messages: Record<string, unknown>[] = [{ role: 'system', content: SYSTEM_PROMPT }]
  for (const raw of body.messages) {
    const message = cleanMessage(raw)
    if (!message) return { error: BAD_FORMAT }
    if (message.role === 'system') continue
    messages.push(message)
  }
  const shape = conversationError(messages.slice(1))
  if (shape) return { error: shape }

  // 넘기는 키는 여기서 정한 것뿐이다 — 브라우저가 보낸 모르는 키를 넘기면 LLM 서버의 옵션을 바깥에서 조작할 수 있다.
  // 생각 세기는 채팅 템플릿의 앞부분을 바꾼다 — 요청마다 다르면 KV 캐시가 깨지므로 서버가 정한 한 값만 쓴다
  return {
    payload: {
      model: settings.model, messages, tools: toolSchemas(), tool_choice: toolChoice, temperature: 0.2, max_tokens: settings.maxTokens, stream: true,
      ...(settings.reasoningEffort ? { reasoning_effort: settings.reasoningEffort } : {}),
    },
  }
}

/**
 * 받는 그림 주소의 앞부분. 앱은 캔버스에서 다시 만든 JPEG를 data URL로만 보낸다 (`record/savePhotos.ts encodeForAI`).
 * http(s) 주소를 넘기면 맥의 LLM 서버(Unsloth Studio·llama.cpp)가 그 주소를 **직접 내려받는다** —
 * 남이 고른 서버에 운영자 집의 공인 IP가 남고, 맥이 남의 심부름으로 파일을 받아 온다 (2026-11-23 점검 1-2).
 */
const IMAGE_PREFIX = 'data:image/jpeg;base64,'

/** 내용의 모양이 틀렸다는 표시 (`cleanContent`) — 내용 자리에 올 수 없는 값이라 undefined·null과 헷갈리지 않는다 */
const INVALID = Symbol('invalid')

/**
 * 메시지 하나를 넘겨도 되는 모양으로 다시 만든다 — 역할·내용과 도구 호출의 짝(`tool_calls`·`tool_call_id`)만 남긴다.
 * 모르는 역할이거나 내용의 모양이 틀리면 null.
 */
function cleanMessage(raw: unknown): Record<string, unknown> | null {
  if (!isRecord(raw) || typeof raw.role !== 'string' || !ROLES.has(raw.role)) return null
  const content = cleanContent(raw.content)
  if (content === INVALID) return null
  const message: Record<string, unknown> = { role: raw.role, content }
  if (raw.tool_calls !== undefined) {
    const calls = cleanToolCalls(raw.tool_calls)
    if (calls === INVALID) return null
    message.tool_calls = calls
  }
  if (typeof raw.tool_call_id === 'string') message.tool_call_id = raw.tool_call_id
  return message
}

/**
 * 도구 호출 목록을 앱이 만드는 모양(`{id, type:'function', function:{name, arguments}}`, `llmClient.ts ToolCall`)으로 다시 만든다.
 * 모르는 키를 떼어 낸다. 배열이 아니거나, 호출 하나라도 id·이름·인자가 글자가 아니면 INVALID.
 */
function cleanToolCalls(calls: unknown): unknown {
  if (!Array.isArray(calls)) return INVALID
  const out = calls.map((c) => {
    if (!isRecord(c) || c.type !== 'function' || !isRecord(c.function)) return null
    const { name, arguments: args } = c.function
    if (typeof c.id !== 'string' || typeof name !== 'string' || typeof args !== 'string') return null
    return { id: c.id, type: 'function', function: { name, arguments: args } }
  })
  return out.includes(null) ? INVALID : out
}

/**
 * 내용을 넘겨도 되는 모양으로 다시 만든다. 내용은 글자, 비어 있음(null — 도구만 부른 답), 또는 글·그림 조각의 배열이다.
 * 조각은 앱이 만드는 모양(`{type:'text', text}`·`{type:'image_url', image_url:{url}}`)으로 다시 만들어 모르는 키를 떼어 낸다.
 * 그 밖의 조각(소리·파일 등), 글자가 아닌 text, `IMAGE_PREFIX`로 시작하지 않는 그림 주소가 하나라도 있으면 INVALID.
 */
function cleanContent(content: unknown): unknown {
  if (content === undefined || content === null || typeof content === 'string') return content
  if (!Array.isArray(content)) return INVALID
  const parts = content.map(cleanPart)
  return parts.includes(null) ? INVALID : parts
}

/** 글·그림 조각 하나를 다시 만든다. 받을 수 없는 조각이면 null (`cleanContent`) */
function cleanPart(part: unknown): Record<string, unknown> | null {
  if (!isRecord(part)) return null
  if (part.type === 'text') return typeof part.text === 'string' ? { type: 'text', text: part.text } : null
  if (part.type !== 'image_url' || !isRecord(part.image_url)) return null
  const url = part.image_url.url
  return typeof url === 'string' && url.startsWith(IMAGE_PREFIX) ? { type: 'image_url', image_url: { url } } : null
}

/** 배열이 아닌 객체인지 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
