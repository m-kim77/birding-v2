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
 * **모든 사용자를 합친 상한**(하루 함수 시간·동시 요청 수)은 맥으로 보내기 전에 `_lib/llmQuota.ts`가 본다 — 넘으면 곧바로 429.
 *
 * 환경변수: LOCAL_LLM_URL(예: https://llm.example.com/v1), LOCAL_LLM_KEY(선택), LOCAL_LLM_MODEL,
 * LOCAL_LLM_MAX_TOKENS(선택, 기본 4096), LOCAL_LLM_FIRST_RESPONSE_SECONDS(선택, 기본 90),
 * LOCAL_LLM_REASONING_EFFORT(선택, 기본 low — low·medium·high·xhigh, 'server'면 보내지 않음. `_lib/llmRequest.ts reasoningEffortOf`),
 * 전체 상한: UPSTASH_REDIS_REST_URL·UPSTASH_REDIS_REST_TOKEN 또는 KV_REST_API_URL·KV_REST_API_TOKEN(없으면 상한 없음),
 * LLM_DAILY_SECONDS(선택, 기본 18000), LLM_MAX_CONCURRENT(선택, 기본 3)
 */
// 경로에 .ts를 적는다 — 확장자 없는 경로는 배포된 함수에서 못 찾는다 (_lib/llmRequest.ts 머리말)
import { buildLlmRequest, reasoningEffortOf } from './_lib/llmRequest.ts'
import { admit, quotaLimitsOf, quotaStoreOf } from './_lib/llmQuota.ts'
import { relayStream } from './_lib/llmStream.ts'
import { sameOrigin } from './_lib/origin.ts'

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
 * 그동안 이 함수가 한 턴 마감까지 붙잡으면 Vercel Hobby의 한 달 한도를 빨리 먹고,
 * 한도를 넘으면 판정과 장소 이름 찾기가 모든 사용자에게서 멈춘다. 모델을 처음 올리는 수십 초보다는 길게 잡았다.
 * 첫 조각이 온 뒤로는 이 마감 대신 조각 사이 마감(`IDLE_SECONDS`)과 한 턴 마감(`TURN_SECONDS`)이 걸린다.
 */
const DEFAULT_FIRST_RESPONSE_SECONDS = 90

/**
 * 이 함수의 최대 실행 시간(초). **`vercel.json`의 `api/llm.ts` maxDuration과 같아야 한다** (`test/vercelConfig.test.ts`가 본다).
 * Vercel 요금은 함수가 열려 있는 시간이라(Hobby는 2GB 고정, 한 달 360 GB-시간 — 넘으면 모든 배포가 멈춘다) 크게 두지 않는다.
 * 한 턴 = 첫 응답 기다림(많아야 90초) + 답 만들기(실측 대개 1분 안쪽)에 여유를 더했다.
 */
export const MAX_DURATION_SECONDS = 180

/**
 * 한 턴 전체의 마감(초, 요청을 받은 때부터). 최대 실행 시간보다 조금 앞에 두어, Vercel이 함수를 끊기 전에
 * 스스로 닫고 브라우저에 "너무 오래 걸려 끊었습니다"를 보낸다 (`_lib/llmStream.ts TOO_LONG_EVENT`).
 */
export const TURN_SECONDS = MAX_DURATION_SECONDS - 10

/**
 * 첫 조각 뒤, 조각 사이에 이만큼(초) 아무것도 오지 않으면 끊고 "쉬는 중"으로 끝낸다 (`_lib/llmStream.ts`).
 * 생각하는 모델도 생각을 조각으로 바로 흘려보내 정상인 답은 몇 초 넘게 멈추지 않는다 — 1분이면 맥이 잠들었거나 연결이 끊긴 것이다.
 */
const IDLE_SECONDS = 60

/** 응답이 끝난 뒤에도 마쳐야 하는 일을 함수 실행기에 맡긴다 */
type KeepAlive = (work: Promise<unknown>) => void

/** 함수 실행기가 전역에 두는 요청 문맥 (`@vercel/functions`가 읽는 것과 같은 자리) */
type RequestContextHolder = { get?: () => { waitUntil?: (work: Promise<unknown>) => void } | undefined }

/**
 * 이 요청의 `waitUntil`을 잡아 둔다 — 응답이 끝난 뒤에 도는 일(쓴 시간 적기)을 Vercel이 끝까지 돌리게 하는 길이다.
 * `@vercel/functions`의 `waitUntil`이 하는 일과 같다(전역 `Symbol.for('@vercel/request-context')`의 요청 문맥) — 이 몇 줄 때문에 패키지를 더하지 않았다.
 * 왜: 브라우저가 답을 받다 끊으면 끝 적기는 응답이 끝난 뒤(스트림의 cancel)에 돈다. 맡기지 않으면 함수가 먼저 멈출 수 있고,
 * 그러면 열림 표시가 180초 남아 다른 사람의 판정이 '요청이 많아'에 걸린다 (쓴 시간은 미리 센 최대 실행 시간으로 남는다).
 * 요청을 받을 때 잡는다 — 스트림이 끊길 때는 이 요청의 문맥 밖일 수 있다. 문맥이 없으면(개발 서버·시험) 아무것도 하지 않고, 맡기다 실패해도 던지지 않는다.
 */
function keepAliveOf(): KeepAlive {
  try {
    const holder = (globalThis as unknown as Record<symbol, RequestContextHolder | undefined>)[Symbol.for('@vercel/request-context')]
    const context = holder?.get?.()
    const waitUntil = context?.waitUntil
    if (context && typeof waitUntil === 'function') {
      return (work) => { try { waitUntil.call(context, work) } catch { /* 맡기지 못해도 일은 돈다 */ } }
    }
  } catch { /* 문맥을 읽지 못했다 — 맡기지 않고 돈다 */ }
  return () => {}
}

/**
 * 한국어 안내와 함께 JSON 오류 응답을 만든다. `limit`은 전체 상한에 걸린 이유(`x-llm-limit` 머리말) —
 * 브라우저는 이 머리말이 있는 429에서만 본문의 안내를 쓴다 (Firewall의 429는 우리 JSON이 아니다).
 */
function fail(status: number, message: string, limit?: string): Response {
  return Response.json({ error: { message } }, { status, headers: limit ? { 'x-llm-limit': limit } : {} })
}

/**
 * LLM 서버가 오류 번호로 답했을 때 브라우저에 보낼 안내.
 * 502·503·504는 LLM 서버 앞의 중계기(Tailscale Funnel 등)가 뒤의 서버에 닿지 못했을 때 주는 번호다 —
 * 맥은 켜져 있고 Unsloth만 꺼진 경우라 "쉬는 중"으로 알린다. 그 밖(400·401·403·500 등)은 번호를 붙여 요청·키 문제를 찾게 한다.
 */
function upstreamFailure(status: number): string {
  if (status === 502 || status === 503 || status === 504) return '판정 서버가 쉬는 중입니다.'
  return `판정 서버가 요청을 처리하지 못했습니다 (${status}).`
}

/**
 * 첫 응답을 기다리는 시간(ms). 환경변수가 없거나 0 이하·숫자가 아니면 기본값.
 * 한 턴 마감(`endAt`)까지 남은 시간보다 길게는 기다리지 않는다 — 환경변수를 크게 적어도 최대 실행 시간을 넘지 않게.
 */
function firstResponseMs(endAt: number): number {
  const seconds = Number(process.env.LOCAL_LLM_FIRST_RESPONSE_SECONDS)
  return Math.min((seconds > 0 ? seconds : DEFAULT_FIRST_RESPONSE_SECONDS) * 1000, endAt - Date.now())
}

/**
 * POST /api/llm — 본문은 OpenAI chat.completions 형식. 다른 사이트에서 온 요청이면 403, 검사에 걸리면 400(`_lib/llmRequest.ts`), 서버 설정이 없으면 503,
 * LLM 서버가 첫 응답을 마감 안에 주지 않으면 503(= "바쁩니다"), 닿지 못하거나 502·503·504로 답하면 502(= "쉬는 중"),
 * 그 밖의 오류 번호면 502(= "처리하지 못했습니다 (번호)")를 준다.
 * 모든 사용자를 합친 상한에 걸리면 429(하루 시간을 다 씀·동시 요청이 많음), 그 상한을 세는 저장소에 닿지 못하면 503 — 둘 다 맥에 가지 않는다.
 */
export async function POST(request: Request): Promise<Response> {
  // 본문을 받는 시간도 함수가 열려 있는 시간이다 — 한 턴 마감과 쓴 시간은 요청을 받은 때부터 잰다
  const startedAt = Date.now()
  const endAt = startedAt + TURN_SECONDS * 1000
  const keepAlive = keepAliveOf()
  // 다른 사이트가 방문자의 브라우저로 대신 부르는 길을 막는다 (`_lib/origin.ts`) — 맥과 함수 시간을 남의 방문자 수만큼 쓰게 된다
  if (!sameOrigin(request)) return fail(403, '다른 사이트에서 온 요청입니다.')
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

  // 모든 사용자를 합친 상한 — 넘으면 맥에 보내지 않고 곧바로 답해 함수가 몇 ms 만에 끝난다.
  // 지시문·첫 판정 요청 뒤에 글이 더 있으면 이미 시작한 판정의 다음 턴이다 — 동시 요청 상한을 넉넉히 받는다 (`_lib/llmQuota.ts CONTINUING_FACTOR`)
  const continuing = (built.payload.messages as unknown[]).length > 2
  const limits = quotaLimitsOf(process.env, MAX_DURATION_SECONDS * 1000, continuing)
  const admission = await admit(quotaStoreOf(process.env), limits, startedAt)
  if (!admission.ok) return fail(admission.status, admission.message, admission.reason)
  // 끝 적기는 어느 길에서 돌든 실행기에 맡긴다 — 브라우저가 끊은 길에서는 응답이 끝난 뒤에 돈다
  const finish = () => { const work = admission.finish(); keepAlive(work); return work }
  return forward(request, { base, model, payload: built.payload, endAt, finish })
}

/** 받아들인 한 턴을 LLM 서버로 넘기는 데 필요한 것 */
interface Turn {
  base: string
  model: string
  payload: Record<string, unknown>
  /** 한 턴을 끝내야 하는 시각(ms) */
  endAt: number
  /** 끝날 때 한 번 부른다 — 쓴 시간을 적는다 (`_lib/llmQuota.ts`). 던지지 않는다 */
  finish: () => Promise<void>
}

/**
 * LLM 서버에 한 턴을 보내고 답을 흘려보낸다. 스트림으로 답하지 못하는 길(오류 번호·닿지 못함·첫 응답 마감)에서는
 * 쓴 시간을 적은 뒤 오류로 답하고, 스트림으로 답하면 스트림이 끝날 때 적는다 (`_lib/llmStream.ts onEnd`).
 */
async function forward(request: Request, turn: Turn): Promise<Response> {
  // 첫 응답의 마감. 마감이 지나도, 브라우저가 떠나도(request.signal) LLM 서버로 가는 요청을 끊는다.
  // 배포에서 request.signal은 vercel.json의 supportsCancellation이 있어야 울린다 — 없으면 맥이 버려진 답을 끝까지 만든다
  const deadline = new AbortController()
  const timer = setTimeout(() => deadline.abort(), firstResponseMs(turn.endAt))
  try {
    const upstream = await fetch(`${turn.base.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(process.env.LOCAL_LLM_KEY ? { authorization: `Bearer ${process.env.LOCAL_LLM_KEY}` } : {}) },
      body: JSON.stringify(turn.payload),
      signal: AbortSignal.any([request.signal, deadline.signal]),
    })
    if (!upstream.ok || !upstream.body) { await turn.finish(); return fail(502, upstreamFailure(upstream.status)) }
    const stream = await relayStream(upstream.body, { idleMs: IDLE_SECONDS * 1000, endAt: turn.endAt, onEnd: turn.finish })
    return new Response(stream, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store', 'x-llm-model': turn.model } })
  } catch {
    await turn.finish()
    return deadline.signal.aborted ? fail(503, '판정 서버가 바쁩니다. 잠시 뒤 다시 물어봐 주세요.') : fail(502, '판정 서버가 쉬는 중입니다.')
  } finally {
    // 첫 조각을 받았거나 실패했다 — 어느 쪽이든 마감은 더 필요 없다
    clearTimeout(timer)
  }
}
