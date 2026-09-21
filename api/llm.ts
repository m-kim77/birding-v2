/**
 * 기본 제공 AI로 가는 통로 (Vercel 함수). 브라우저가 보낸 OpenAI 형식 요청을 운영자의 LLM 서버로 넘기고,
 * 응답 스트림을 그대로 돌려준다.
 *
 * **이 함수는 사용자가 준 주소로 가지 않는다.** 목적지는 환경변수(LOCAL_LLM_URL)로만 정해진다 —
 * 요청에서 주소를 받으면 이 함수가 아무 곳이나 찔러 주는 열린 프록시(SSRF)가 된다.
 * 자기 API 키를 쓰는 사용자는 이 함수를 거치지 않고 브라우저에서 그 서비스로 직접 간다 (키가 우리 서버를 지나지 않는다).
 *
 * 환경변수: LOCAL_LLM_URL(예: https://llm.example.com/v1), LOCAL_LLM_KEY(선택), LOCAL_LLM_MODEL, LOCAL_LLM_MAX_TOKENS(선택, 기본 4096)
 */

/** 요청 본문의 상한. 1024px JPEG 한 장 + 대화 기록이면 2MB를 넘지 않는다 */
const MAX_BODY_BYTES = 4_000_000

/**
 * 한 턴에 낼 수 있는 토큰의 기본 상한. **생각(reasoning) 토큰도 여기에 들어간다** —
 * 2048로 뒀을 때 생각하는 모델(Qwen3 계열)이 상한을 생각에 다 쓰고 답을 한 글자도 못 낸 적이 있다 (실측).
 * LM Studio에서는 요청 옵션으로 생각을 끌 수 없었다. 서버나 모델을 바꾸면 환경변수로 조절한다.
 */
const DEFAULT_MAX_TOKENS = 4096

/** 한국어 안내와 함께 JSON 오류 응답을 만든다 */
function fail(status: number, message: string): Response {
  return Response.json({ error: { message } }, { status })
}

/**
 * POST /api/llm — 본문은 OpenAI chat.completions 형식. `model`은 무시하고 서버가 정한 모델을 쓴다.
 * 서버 설정이 없으면 503, LLM 서버에 닿지 못하면 502(= "판정 서버가 쉬는 중")를 준다.
 */
export async function POST(request: Request): Promise<Response> {
  const base = process.env.LOCAL_LLM_URL
  const model = process.env.LOCAL_LLM_MODEL
  if (!base || !model) return fail(503, '기본 제공 AI가 아직 설정되지 않았습니다.')

  const text = await request.text()
  if (text.length > MAX_BODY_BYTES) return fail(413, '사진이 너무 큽니다.')
  let body: Record<string, unknown>
  try { body = JSON.parse(text) } catch { return fail(400, '요청 형식이 잘못되었습니다.') }
  if (!Array.isArray(body.messages)) return fail(400, '요청 형식이 잘못되었습니다.')

  // 넘겨도 되는 키만 고른다 — 모르는 키를 그대로 넘기면 서버 옵션을 바깥에서 조작할 수 있다
  const payload = { model, messages: body.messages, tools: body.tools, tool_choice: body.tool_choice, temperature: 0.2, max_tokens: Number(process.env.LOCAL_LLM_MAX_TOKENS) || DEFAULT_MAX_TOKENS, stream: true }

  let upstream: Response
  try {
    upstream = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(process.env.LOCAL_LLM_KEY ? { authorization: `Bearer ${process.env.LOCAL_LLM_KEY}` } : {}) },
      body: JSON.stringify(payload),
      signal: request.signal,
    })
  } catch {
    return fail(502, '판정 서버가 쉬는 중입니다.')
  }
  if (!upstream.ok || !upstream.body) return fail(502, `판정 서버가 요청을 처리하지 못했습니다 (${upstream.status}).`)

  return new Response(upstream.body, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store', 'x-llm-model': model } })
}
