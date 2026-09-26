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
const { SYSTEM_PROMPT } = await import('../src/features/identify/prompts.ts')

test.after(() => { upstream.closeAllConnections(); upstream.close() })
test.beforeEach(() => { received = null; closed = false; process.env.LOCAL_LLM_URL = UPSTREAM_URL })

const sse = (text: string) => `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
/** 시간을 재는 시험의 제한 — 마감이 고장 나도 `npm run check`가 영영 멈추지 않고 실패하게 */
const TIMED = { timeout: 5_000 }

/** 판정 요청 하나를 통로에 보낸다 */
function ask(body: unknown = { messages: [{ role: 'user', content: '새' }], tool_choice: 'auto' }): Promise<Response> {
  return POST(new Request('http://localhost/api/llm', { method: 'POST', body: JSON.stringify(body) }))
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
  const res = await ask({ messages: [{ role: 'system', content: '딴 지시' }, { role: 'user', content: '새' }], model: 'other' })
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

test('첫 조각이 온 뒤로는 마감이 없다 — 느린 답도 끝까지 온다', TIMED, async () => {
  respond = (_req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.write(sse('생각 중'))
    setTimeout(() => res.end(sse('답')), 500)
  }
  const res = await ask()
  assert.equal(res.status, 200)
  assert.equal(await res.text(), sse('생각 중') + sse('답'))
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

test('검사에 걸린 요청은 LLM 서버에 가지 않고 400', async () => {
  const res = await ask({ messages: Array.from({ length: 41 }, () => ({ role: 'user', content: '새' })) })
  assert.equal(res.status, 400)
  assert.match(await messageOf(res), /대화가 너무 깁니다/)
  assert.equal(received, null)
})
