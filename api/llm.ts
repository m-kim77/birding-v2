/**
 * 기본 제공 AI로 가는 통로 (Vercel 함수). 브라우저가 보낸 판정 대화를 검사해 운영자의 LLM 서버로 넘기고,
 * 응답 스트림을 그대로 돌려준다.
 *
 * **이 함수는 사용자가 준 주소로 가지 않는다.** 목적지는 환경변수(LOCAL_LLM_URL)로만 정해진다 —
 * 요청에서 주소를 받으면 이 함수가 아무 곳이나 찔러 주는 열린 프록시(SSRF)가 된다.
 * **지시문(시스템 프롬프트)·도구·모델도 서버가 정한다** (`_lib/llmRequest.ts`) — 목적지를 고정해도 그 LLM을 아무 일에나
 * 쓰게 두면 운영자의 맥이 남의 무료 챗봇이 된다.
 * 자기 API 키를 쓰는 사용자는 이 함수를 거치지 않고 브라우저에서 그 서비스로 직접 간다 (키가 우리 서버를 지나지 않는다).
 * IP마다의 요청 수 제한은 코드가 아니라 Vercel Firewall 규칙이 맡는다 (README "Vercel 배포").
 *
 * 환경변수: LOCAL_LLM_URL(예: https://llm.example.com/v1), LOCAL_LLM_KEY(선택), LOCAL_LLM_MODEL,
 * LOCAL_LLM_MAX_TOKENS(선택, 기본 4096), LOCAL_LLM_FIRST_RESPONSE_SECONDS(선택, 기본 90),
 * LOCAL_LLM_REASONING_EFFORT(선택, 기본 low — low·medium·high·xhigh, 'server'면 보내지 않음. `_lib/llmRequest.ts reasoningEffortOf`)
 */
// 경로에 .ts를 적는다 — 확장자 없는 경로는 배포된 함수에서 못 찾는다 (_lib/llmRequest.ts 머리말)
import { buildLlmRequest, reasoningEffortOf } from './_lib/llmRequest.ts'

/** 요청 본문의 상한. 1024px JPEG 한 장 + 대화 기록이면 2MB를 넘지 않는다 */
const MAX_BODY_BYTES = 4_000_000

/**
 * 한 턴에 낼 수 있는 토큰의 기본 상한. **생각(reasoning) 토큰도 여기에 들어간다** —
 * 2048로 뒀을 때 생각하는 모델(Qwen3 계열)이 상한을 생각에 다 쓰고 답을 한 글자도 못 낸 적이 있다 (실측).
 * LM Studio에서는 요청 옵션으로 생각을 끌 수 없었다. 서버나 모델을 바꾸면 환경변수로 조절한다.
 */
const DEFAULT_MAX_TOKENS = 4096

/**
 * LLM 서버가 첫 응답(스트림의 첫 조각)을 줄 때까지 기다리는 기본 시간(초). 넘으면 "판정 서버가 바쁩니다"로 끝낸다.
 * 맥의 LLM은 한 번에 몇 개만 처리해서, 앞 요청이 밀려 있으면 뒤 요청은 첫 글자도 못 받은 채 기다린다 —
 * 그동안 이 함수가 최대 실행 시간(300초, vercel.json)을 붙잡으면 Vercel Hobby의 한 달 한도를 빨리 먹고,
 * 한도를 넘으면 판정과 장소 이름 찾기가 모든 사용자에게서 멈춘다. 모델을 처음 올리는 수십 초보다는 길게 잡았다.
 * 첫 조각이 온 뒤로는 끊지 않는다 — 한 턴 전체의 시간은 300초가 맡는다.
 */
const DEFAULT_FIRST_RESPONSE_SECONDS = 90

/** 한국어 안내와 함께 JSON 오류 응답을 만든다 */
function fail(status: number, message: string): Response {
  return Response.json({ error: { message } }, { status })
}

/** 첫 응답을 기다리는 시간(ms). 환경변수가 없거나 0 이하·숫자가 아니면 기본값 */
function firstResponseMs(): number {
  const seconds = Number(process.env.LOCAL_LLM_FIRST_RESPONSE_SECONDS)
  return (seconds > 0 ? seconds : DEFAULT_FIRST_RESPONSE_SECONDS) * 1000
}

/**
 * 스트림의 첫 조각을 받은 뒤, 그 조각부터 끝까지 흘려보내는 새 스트림을 준다.
 * 첫 조각을 기다리는 동안 요청이 끊기면(마감·브라우저가 떠남) 던진다. 첫 조각 전에 끝나면 빈 스트림.
 * 받는 쪽(브라우저)이 끊으면 LLM 서버 쪽 스트림도 끊는다 — 그래야 맥이 그 일을 버린다.
 */
async function startStream(body: ReadableStream<Uint8Array>): Promise<ReadableStream<Uint8Array>> {
  const reader = body.getReader()
  const first = await reader.read()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      if (first.done) controller.close(); else controller.enqueue(first.value)
    },
    async pull(controller) {
      const { done, value } = await reader.read()
      if (done) controller.close(); else controller.enqueue(value)
    },
    cancel(reason) {
      return reader.cancel(reason)
    },
  })
}

/**
 * POST /api/llm — 본문은 OpenAI chat.completions 형식. 검사에 걸리면 400(`_lib/llmRequest.ts`), 서버 설정이 없으면 503,
 * LLM 서버가 첫 응답을 마감 안에 주지 않으면 503(= "바쁩니다"), 닿지 못하거나 오류로 답하면 502(= "쉬는 중")를 준다.
 */
export async function POST(request: Request): Promise<Response> {
  const base = process.env.LOCAL_LLM_URL
  const model = process.env.LOCAL_LLM_MODEL
  if (!base || !model) return fail(503, '기본 제공 AI가 아직 설정되지 않았습니다.')

  const text = await request.text()
  if (text.length > MAX_BODY_BYTES) return fail(413, '사진이 너무 큽니다.')
  let body: unknown
  try { body = JSON.parse(text) } catch { return fail(400, '요청 형식이 잘못되었습니다.') }
  const built = buildLlmRequest(body, {
    model,
    maxTokens: Number(process.env.LOCAL_LLM_MAX_TOKENS) || DEFAULT_MAX_TOKENS,
    reasoningEffort: reasoningEffortOf(process.env.LOCAL_LLM_REASONING_EFFORT),
  })
  if ('error' in built) return fail(400, built.error)

  // 첫 응답의 마감. 마감이 지나도, 브라우저가 떠나도(request.signal) LLM 서버로 가는 요청을 끊는다
  const deadline = new AbortController()
  const timer = setTimeout(() => deadline.abort(), firstResponseMs())
  try {
    const upstream = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(process.env.LOCAL_LLM_KEY ? { authorization: `Bearer ${process.env.LOCAL_LLM_KEY}` } : {}) },
      body: JSON.stringify(built.payload),
      signal: AbortSignal.any([request.signal, deadline.signal]),
    })
    if (!upstream.ok || !upstream.body) return fail(502, `판정 서버가 요청을 처리하지 못했습니다 (${upstream.status}).`)
    const stream = await startStream(upstream.body)
    return new Response(stream, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store', 'x-llm-model': model } })
  } catch {
    return deadline.signal.aborted ? fail(503, '판정 서버가 바쁩니다. 잠시 뒤 다시 물어봐 주세요.') : fail(502, '판정 서버가 쉬는 중입니다.')
  } finally {
    // 첫 조각을 받았거나 실패했다 — 어느 쪽이든 마감은 더 필요 없다
    clearTimeout(timer)
  }
}
