/**
 * 기본 제공 AI로 온 대화가 **앱의 판정 루프가 만드는 모양**(`src/features/identify/loop.ts runIdentify`)인지 가린다. 순수 함수다.
 * `_lib/llmRequest.ts`가 메시지를 다시 만든 뒤에 부른다 (`test/llmRequest.test.ts`).
 *
 * 왜: 지시문·도구를 서버가 정해도, 그림 없이 "시를 써 줘" 같은 글만 보내면 맥의 LLM이 그 일을 했다 —
 * 아무 OpenAI 호환 채팅 프로그램에 이 주소를 넣기만 하면 무료 챗봇이 됐다 (2026-11-23 점검 1-1).
 *
 * **이 검사는 보안 경계가 아니다.** 막는 것은 그런 손쉬운 사용뿐이다. 저장소를 읽은 사람은 앱 모양을 갖추고
 * 첫 글의 뒷부분·조수 글·도구 결과에 지시를 끼워 넣을 수 있다 — 도구는 브라우저에서 돌아서 서버는 결과가 진짜인지 모른다.
 * 남용(맥을 붙잡기, Vercel 한도 쓰기)은 요청 수 제한이 맡는다 (README "Vercel 배포").
 *
 * 글자 수·호출 수 상한은 두지 않는다 (첫 글만 예외). 본문은 `api/llm.ts MAX_BODY_BYTES`가, 프롬프트 길이는 LLM 서버의
 * 문맥 창이 묶는다 — 창보다 긴 요청은 서버가 곧바로 거절해 맥을 붙잡지 못한다. 반면 상한을 두면 진짜 판정이 막힌다:
 * 답을 못 읽어 다시 청할 때 그 답(생각 태그 포함, 길이는 `LOCAL_LLM_MAX_TOKENS`에 달림)이 그대로 실리고,
 * 앱은 한 답에 든 도구 호출을 몇 개든 다 실행해 대화에 남긴다 (2026-11-23 검토에서 재현).
 *
 * 앱의 대화는 이렇다 — 이 모양이 바뀌면(새 사용자 글, 사진 두 장 등) 이 파일도 함께 고친다. 안 고치면 판정이 400으로 막힌다:
 * 1. 사용자: 판정 요청 글(`userPrompt`) 하나 + 그림 한 장
 * 2. 조수: 글(또는 null) + 도구 호출 → 도구: 결과 글 (되풀이)
 * 3. (도구 한도에 닿으면) 사용자: `WRAP_UP_PROMPT` / (답을 못 읽으면) 조수: 그 답 → 사용자: `RETRY_PROMPT`
 *
 * import 경로에는 `.ts`를 적는다 — 확장자 없는 경로는 배포된 함수에서 못 찾는다 (`_lib/llmRequest.ts` 머리말).
 */
import { RETRY_PROMPT, WRAP_UP_PROMPT, userPrompt } from '../../src/features/identify/prompts.ts'

/**
 * 첫 사용자 글의 글자 수 상한 — 판정 요청 한 줄 + 촬영 시각·장소(Nominatim 이름이나 옛 백업의 값).
 * 앱의 글은 많아야 수백 자다. 긴 장소 이름도 들어가게 넉넉히 잡았다
 */
export const MAX_FIRST_TEXT = 1_000

const BAD_SHAPE = '판정 요청의 모양이 아닙니다.'
/** 첫 사용자 글은 이것으로 시작한다 — 촬영 시각·장소는 그 뒤에 붙는다 (`prompts.ts userPrompt`) */
const REQUEST_START = userPrompt({})
/** 첫 메시지 뒤에 사용자가 보낼 수 있는 글 (앱이 덧붙이는 고정된 말뿐이다) */
const FOLLOW_UPS = new Set([WRAP_UP_PROMPT, RETRY_PROMPT])

/**
 * 대화(지시문을 뺀, 다시 만든 메시지들)가 앱의 모양이면 null, 아니면 브라우저에 돌려줄 한국어 안내.
 * 메시지는 `llmRequest.ts cleanMessage`를 지난 것이라 역할·내용·도구 호출의 기본 모양(글자인지 등)은 이미 맞다.
 */
export function conversationError(messages: Record<string, unknown>[]): string | null {
  const [first, ...rest] = messages
  if (!first) return BAD_SHAPE
  const photo = firstMessageError(first)
  if (photo) return photo
  if (!rest.every(isFollowUp)) return BAD_SHAPE
  // 조수 글로 끝나면 모델이 그 글을 이어 쓴다 — 답의 앞부분을 미리 심어 아무 글이나 쓰게 하는 길이다
  const last = messages[messages.length - 1]
  if (last.role !== 'user' && last.role !== 'tool') return BAD_SHAPE
  return null
}

/** 첫 메시지: 사용자의 판정 요청 글 하나와 그림 한 장. 맞으면 null */
function firstMessageError(m: Record<string, unknown>): string | null {
  if (m.role !== 'user' || !Array.isArray(m.content) || m.tool_calls !== undefined) return BAD_SHAPE
  const parts = m.content as Array<Record<string, unknown>>
  const images = parts.filter((p) => p.type === 'image_url').length
  if (images > 1) return '사진은 한 장만 보낼 수 있습니다.'
  if (images === 0) return '사진이 없는 요청은 받지 않습니다.'
  const texts = parts.filter((p) => p.type === 'text').map((p) => p.text)
  const text = texts[0]
  if (texts.length !== 1 || typeof text !== 'string' || !text.startsWith(REQUEST_START) || text.length > MAX_FIRST_TEXT) return BAD_SHAPE
  return null
}

/**
 * 첫 메시지 뒤의 메시지 하나가 앱이 보내는 모양인지. 그림은 첫 메시지에만 있다 — 뒤 메시지의 내용은 글자(또는 조수의 null)뿐이다.
 * 도구 호출은 조수 메시지에만, 비어 있지 않은 목록으로 붙는다. 호출 이름이 정의된 도구인지는 보지 않는다 —
 * 모델이 없는 도구를 부르면 앱은 그 호출을 대화에 그대로 남기고 오류를 결과로 돌려준다 (`tools/index.ts runTool`). 막으면 그 판정이 깨진다.
 */
function isFollowUp(m: Record<string, unknown>): boolean {
  if (m.role === 'user') return typeof m.content === 'string' && FOLLOW_UPS.has(m.content) && m.tool_calls === undefined
  if (m.role === 'tool') return typeof m.content === 'string' && typeof m.tool_call_id === 'string' && m.tool_calls === undefined
  if (m.role !== 'assistant') return false
  const content = m.content ?? null
  const calls = m.tool_calls
  return (content === null || typeof content === 'string') && (calls === undefined || (Array.isArray(calls) && calls.length > 0))
}
