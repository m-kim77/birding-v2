/**
 * 기본 제공 AI로 가는 요청을 검사하고, LLM 서버로 보낼 본문을 만든다. 순수 함수다 (`test/llmRequest.test.ts`).
 * `api/llm.ts`가 쓴다. `api/` 안이라도 `_`로 시작하는 폴더는 Vercel이 함수(주소)로 만들지 않는다.
 *
 * **지시문(시스템 프롬프트)과 도구는 서버가 정한다.** 브라우저가 보낸 것은 버리고 앱의 것을 넣는다 —
 * 저장소가 공개라 요청 모양이 알려져 있고, 그대로 넘기면 누구나 운영자의 LLM을 아무 일에나 시키는 챗봇으로 쓸 수 있다.
 * 앱이 보내던 것과 같은 글이 같은 순서로 실리므로 LLM 서버의 KV 캐시는 전과 같다.
 *
 * 이 파일(과 이 파일이 부르는 파일)의 import 경로에는 `.ts`를 적는다 — 확장자 없는 경로는 배포된 함수에서 못 찾아
 * 함수가 아예 뜨지 않는다 (tsconfig `rewriteRelativeImportExtensions`가 `.ts`를 배포용 `.js`로 바꿔 준다).
 */
import { SYSTEM_PROMPT } from '../../src/features/identify/prompts.ts'
import { toolSchemas } from '../../src/features/identify/tools/definitions.ts'

/**
 * 대화에 실을 수 있는 메시지 수. 앱의 판정 한 건은 많아야 스무 개 남짓이다
 * (지시문·사진 + 도구 8회(`loop.ts MAX_TOOL_CALLS`)의 부름과 결과 + 마무리 + 다시 청하기). `MAX_TOOL_CALLS`를 늘리면 이 값도 본다.
 */
export const MAX_MESSAGES = 40
/** 대화에 실을 수 있는 그림 수. 앱은 사진 한 장만 보낸다 */
export const MAX_IMAGES = 1

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
 * 메시지가 `MAX_MESSAGES`개를 넘거나, 그림이 `MAX_IMAGES`장을 넘거나, `tool_choice`가 auto·none(없으면 auto)이 아니거나,
 * 메시지 모양이 틀리면 `{ error }`를 준다.
 */
export function buildLlmRequest(body: unknown, settings: ServerSettings): LlmRequest {
  if (!isRecord(body) || !Array.isArray(body.messages)) return { error: BAD_FORMAT }
  if (body.messages.length > MAX_MESSAGES) return { error: '대화가 너무 깁니다. 처음부터 다시 물어봐 주세요.' }
  const toolChoice = body.tool_choice ?? 'auto'
  if (toolChoice !== 'auto' && toolChoice !== 'none') return { error: BAD_FORMAT }

  const messages: Record<string, unknown>[] = [{ role: 'system', content: SYSTEM_PROMPT }]
  let images = 0
  for (const raw of body.messages) {
    const message = cleanMessage(raw)
    if (!message) return { error: BAD_FORMAT }
    if (message.role === 'system') continue
    images += countImages(message.content)
    messages.push(message)
  }
  if (images > MAX_IMAGES) return { error: '사진은 한 장만 보낼 수 있습니다.' }

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
 * 메시지 하나를 넘겨도 되는 모양으로 다시 만든다 — 역할·내용과 도구 호출의 짝(`tool_calls`·`tool_call_id`)만 남긴다.
 * 모르는 역할이거나 내용의 모양이 틀리면 null.
 */
function cleanMessage(raw: unknown): Record<string, unknown> | null {
  if (!isRecord(raw) || typeof raw.role !== 'string' || !ROLES.has(raw.role) || !isContent(raw.content)) return null
  const message: Record<string, unknown> = { role: raw.role, content: raw.content }
  if (Array.isArray(raw.tool_calls)) message.tool_calls = raw.tool_calls
  if (typeof raw.tool_call_id === 'string') message.tool_call_id = raw.tool_call_id
  return message
}

/**
 * 내용은 글자, 비어 있음(null — 도구만 부른 답), 또는 글·그림 조각의 배열이다.
 * 앱은 그 밖의 조각(소리·파일 등)을 보내지 않는다.
 */
function isContent(content: unknown): boolean {
  if (content === undefined || content === null || typeof content === 'string') return true
  return Array.isArray(content) && content.every((part) => isRecord(part) && (part.type === 'text' || part.type === 'image_url'))
}

/** 메시지 하나에 든 그림 조각 수 */
function countImages(content: unknown): number {
  return Array.isArray(content) ? content.filter((part) => isRecord(part) && part.type === 'image_url').length : 0
}

/** 배열이 아닌 객체인지 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
