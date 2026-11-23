import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

// 가짜 LLM 서버. 시험마다 `respond`를 바꿔 끼우고, 받은 본문과 연결이 끊겼는지를 적어 둔다
let respond: (req: IncomingMessage, res: ServerResponse) => void = () => {}
let received: Record<string, unknown> | null = null
let closed = false
const upstream = createServer((req, res) => {
  let text = ''
  req.on('data', (chunk) => { text += chunk })
  req.on('end', () => { received = JSON.parse(text); respond(req, res) })
  res.on('close', () => { closed = true })
})
await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve))
const UPSTREAM_URL = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}/v1`
process.env.LOCAL_LLM_URL = UPSTREAM_URL
process.env.LOCAL_LLM_MODEL = 'test-model'
// 첫 응답 마감을 0.3초로 — 실제로 90초를 기다리지 않는다
process.env.LOCAL_LLM_FIRST_RESPONSE_SECONDS = '0.3'
const { POST } = await import('../api/llm.ts')
const { STALL_EVENT } = await import('../api/_lib/llmStream.ts')
const { koreanDay, STORE_MESSAGE } = await import('../api/_lib/llmQuota.ts')
const { fakeUpstash } = await import('./fakeUpstash.ts')
const { SYSTEM_PROMPT } = await import('../src/features/identify/prompts.ts')

test.after(() => { upstream.closeAllConnections(); upstream.close() })
test.beforeEach(() => { received = null; closed = false; process.env.LOCAL_LLM_URL = UPSTREAM_URL })

const sse = (text: string) => `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
/** 시간을 재는 시험의 제한 — 마감이 고장 나도 `npm run check`가 영영 멈추지 않고 실패하게 */
const TIMED = { timeout: 5_000 }

/** 앱의 첫 판정 요청 메시지 — 판정 요청 글 + 사진 한 장 (`_lib/llmConversation.ts`가 이 모양만 받는다) */
const ASK = { role: 'user', content: [{ type: 'text', text: '이 새의 종을 판정해 줘.' }, { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAAA' } }] }

/** 판정 요청 하나를 통로에 보낸다. 브라우저처럼 같은 사이트의 Origin을 붙인다 (`_lib/origin.ts`) */
function ask(body: unknown = { messages: [ASK], tool_choice: 'auto' }, origin: string | null = 'http://localhost'): Promise<Response> {
  const headers: Record<string, string> = origin ? { origin } : {}
  return POST(new Request('http://localhost/api/llm', { method: 'POST', headers, body: JSON.stringify(body) }))
}

/** 오류 응답의 한국어 안내 */
async function messageOf(res: Response): Promise<string> {
  return ((await res.json()) as { error: { message: string } }).error.message
}

test('스트림을 그대로 흘려보내고, LLM 서버에는 서버의 지시문·모델로 간다', async () => {
  respond = (_req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.write(sse('물총'))
    res.end(sse('새') + 'data: [DONE]\n\n')
  }
  const res = await ask({ messages: [{ role: 'system', content: '딴 지시' }, ASK], model: 'other' })
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('x-llm-model'), 'test-model')
  assert.equal(await res.text(), sse('물총') + sse('새') + 'data: [DONE]\n\n')
  assert.equal(received?.model, 'test-model')
  assert.deepEqual((received?.messages as unknown[])[0], { role: 'system', content: SYSTEM_PROMPT })
})

test('첫 응답이 마감 안에 없으면 503 "바쁩니다" — LLM 서버로 가는 요청도 끊는다', TIMED, async () => {
  respond = () => { /* 줄을 서 있는 것처럼 아무 답도 하지 않는다 */ }
  const res = await ask()
  assert.equal(res.status, 503)
  assert.match(await messageOf(res), /바쁩니다/)
  await wait(100)
  assert.equal(closed, true, 'LLM 서버 쪽 연결이 끊겨야 맥이 그 일을 버린다')
})

test('머리글만 오고 첫 조각이 마감 안에 없어도 503', TIMED, async () => {
  respond = (_req, res) => { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.flushHeaders() }
  const res = await ask()
  assert.equal(res.status, 503)
})

test('첫 조각이 온 뒤로는 첫 응답 마감이 없다 — 조각 사이가 첫 응답 마감보다 길어도 끝까지 온다', TIMED, async () => {
  respond = (_req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.write(sse('생각 중'))
    setTimeout(() => res.end(sse('답')), 500)
  }
  const res = await ask()
  assert.equal(res.status, 200)
  assert.equal(await res.text(), sse('생각 중') + sse('답'))
})

test('답을 보내던 LLM 서버 쪽 연결이 끊기면 오류 줄(STALL_EVENT)로 스트림을 닫는다 — 브라우저가 "쉬는 중"을 보여 준다', TIMED, async () => {
  respond = (_req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.write(sse('물총'))
    setTimeout(() => res.destroy(), 50)
  }
  const res = await ask()
  assert.equal(res.status, 200)
  assert.equal(await res.text(), sse('물총') + STALL_EVENT)
})

test('LLM 서버가 오류로 답하면 502, 닿지 못하면 502 "쉬는 중"', async () => {
  respond = (_req, res) => { res.writeHead(500); res.end('{}') }
  const res = await ask()
  assert.equal(res.status, 502)
  assert.match(await messageOf(res), /처리하지 못했습니다 \(500\)/)

  // 방금 열었다 닫은 포트 — 아무도 듣지 않는다
  const probe = createServer()
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve))
  const port = (probe.address() as AddressInfo).port
  await new Promise((resolve) => probe.close(resolve))
  process.env.LOCAL_LLM_URL = `http://127.0.0.1:${port}/v1`
  const down = await ask()
  assert.equal(down.status, 502)
  assert.match(await messageOf(down), /쉬는 중/)
})

test('LLM 서버 앞의 중계기가 502·503·504로 답하면(맥은 켜져 있고 LLM 서버만 꺼짐) 502 "쉬는 중"', async () => {
  for (const status of [502, 503, 504]) {
    respond = (_req, res) => { res.writeHead(status); res.end() }
    const res = await ask()
    assert.equal(res.status, 502)
    assert.equal(await messageOf(res), '판정 서버가 쉬는 중입니다.', `${status}`)
  }
})

test('요청·키 문제(400·401·403)는 번호를 붙인 "처리하지 못했습니다" 그대로', async () => {
  for (const status of [400, 401, 403]) {
    respond = (_req, res) => { res.writeHead(status); res.end('{}') }
    const res = await ask()
    assert.equal(res.status, 502)
    assert.match(await messageOf(res), new RegExp(`처리하지 못했습니다 \\(${status}\\)`))
  }
})

test('그림 없이 글만 든 요청은 LLM 서버에 가지 않고 400', async () => {
  const res = await ask({ messages: [{ role: 'user', content: '파이썬 크롤러 짜 줘.' }] })
  assert.equal(res.status, 400)
  assert.match(await messageOf(res), /판정 요청의 모양이 아닙니다/)
  assert.equal(received, null)
})

test('검사에 걸린 요청은 LLM 서버에 가지 않고 400', async () => {
  const res = await ask({ messages: Array.from({ length: 41 }, () => ({ role: 'user', content: '새' })) })
  assert.equal(res.status, 400)
  assert.match(await messageOf(res), /대화가 너무 깁니다/)
  assert.equal(received, null)
})

test('다른 사이트에서 온 요청·Origin이 없는 요청은 LLM 서버에 가지 않고 403', async () => {
  for (const origin of ['https://evil.example', null]) {
    const res = await ask(undefined, origin)
    assert.equal(res.status, 403)
    assert.match(await messageOf(res), /다른 사이트에서 온 요청/)
  }
  assert.equal(received, null)
})

/** 가짜 Upstash를 붙인다 — 그 주소로 가는 fetch만 가로챈다. 시험이 끝나면 `test.afterEach`가 떼어 낸다 */
const realFetch = globalThis.fetch
function withQuota(env: Record<string, string> = {}) {
  const up = fakeUpstash()
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) =>
    String(input).startsWith('https://upstash.test') ? up.fetch(input, init) : realFetch(input, init)) as typeof fetch
  Object.assign(process.env, { KV_REST_API_URL: 'https://upstash.test', KV_REST_API_TOKEN: 'test-token', ...env })
  return up
}
test.afterEach(() => {
  globalThis.fetch = realFetch
  for (const key of ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'LLM_MAX_CONCURRENT', 'LLM_DAILY_SECONDS']) delete process.env[key]
})

test('전체 상한: 받아들인 한 턴은 스트림이 끝날 때 실제로 쓴 초로 고치고 열림 표시를 지운다', async () => {
  const up = withQuota()
  respond = (_req, res) => { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.end(sse('새')) }
  const res = await ask()
  assert.equal(await res.text(), sse('새'))
  assert.equal(up.counters.get(`llm:sec:${koreanDay(Date.now())}`), 1)
  assert.equal(up.zsets.get('llm:active')?.size, 0)
})

test('전체 상한: 동시 요청이 상한을 넘으면 LLM 서버에 가지 않고 곧바로 429 (x-llm-limit: busy)', async () => {
  const up = withQuota({ LLM_MAX_CONCURRENT: '1' })
  up.zsets.set('llm:active', new Map([['다른-요청', Date.now()]]))
  const res = await ask()
  assert.equal(res.status, 429)
  assert.equal(res.headers.get('x-llm-limit'), 'busy')
  assert.equal(received, null)
})

test('전체 상한: 오늘 쓸 시간을 다 썼으면 429 (x-llm-limit: day)', async () => {
  const up = withQuota({ LLM_DAILY_SECONDS: '60' })
  up.counters.set(`llm:sec:${koreanDay(Date.now())}`, 60)
  const res = await ask()
  assert.equal(res.status, 429)
  assert.equal(res.headers.get('x-llm-limit'), 'day')
  assert.equal(received, null)
})

test('전체 상한: 상한을 세는 저장소에 닿지 못하면 LLM 서버에 가지 않고 503', async () => {
  const up = withQuota()
  up.state.mode = 'down'
  const res = await ask()
  assert.equal(res.status, 503)
  assert.equal(await messageOf(res), STORE_MESSAGE)
  assert.equal(received, null)
})

test('전체 상한: LLM 서버가 오류로 답해 스트림이 없어도 쓴 시간을 적고 열림 표시를 지운다', async () => {
  const up = withQuota()
  respond = (_req, res) => { res.writeHead(502); res.end() }
  assert.equal((await ask()).status, 502)
  assert.equal(up.counters.get(`llm:sec:${koreanDay(Date.now())}`), 1)
  assert.equal(up.zsets.get('llm:active')?.size, 0)
})
