import test from 'node:test'
import assert from 'node:assert/strict'
import { chat, LlmUnavailableError } from '../src/features/identify/llmClient.ts'
import type { OwnKey } from '../src/features/identify/connection.ts'

const OWN: OwnKey = { baseUrl: 'https://example.test/v1', apiKey: 'sk-test', model: 'vision-1' }
const realFetch = globalThis.fetch
test.afterEach(() => { globalThis.fetch = realFetch })

/** fetch가 정해진 응답 하나를 돌려주게 바꿔 끼운다 */
function answerWith(res: Response): void {
  globalThis.fetch = async () => res
}

/** 한 턴을 보낸다. 내 키(own)가 null이면 기본 제공 AI */
function send(own: OwnKey | null) {
  return chat(own, [], [], 'auto', new AbortController().signal, () => {})
}

test('기본 제공 AI가 요청 제한(429)에 걸리면 한국어 안내 — 잠시 뒤 다시 하면 되는 실패로', async () => {
  answerWith(new Response('<html>Too Many Requests</html>', { status: 429 }))
  await assert.rejects(send(null), (e: unknown) => e instanceof LlmUnavailableError && /요청이 많아 잠시 쉬어 갑니다/.test(e.message))
})

test('기본 제공 AI의 전체 상한(x-llm-limit)에 걸린 429는 서버가 준 이유 그대로 — 오늘 시간을 다 쓴 것과 잠깐 붐비는 것은 다시 물을 때가 다르다', async () => {
  answerWith(Response.json({ error: { message: '오늘 기본 제공 AI가 쓸 수 있는 시간을 다 썼습니다. 내일 다시 물어봐 주세요.' } }, { status: 429, headers: { 'x-llm-limit': 'day' } }))
  await assert.rejects(send(null), (e: unknown) => e instanceof LlmUnavailableError && /내일 다시/.test(e.message))
})

test('머리말이 없는 429(Firewall)는 본문이 JSON이어도 우리 안내로 — 남의 영어 문구를 보여 주지 않는다', async () => {
  answerWith(Response.json({ error: { message: 'Rate limit exceeded' } }, { status: 429 }))
  await assert.rejects(send(null), (e: unknown) => e instanceof LlmUnavailableError && /요청이 많아 잠시 쉬어 갑니다/.test(e.message))
})

test('내 키 서비스의 429는 그 서비스가 준 안내를 그대로', async () => {
  answerWith(Response.json({ error: { message: 'You exceeded your current quota' } }, { status: 429 }))
  await assert.rejects(send(OWN), (e: unknown) => e instanceof Error && !(e instanceof LlmUnavailableError) && /exceeded your current quota/.test(e.message))
})

test('503은 서버가 보낸 이유 그대로 — 첫 응답 마감의 "바쁩니다"', async () => {
  answerWith(Response.json({ error: { message: '판정 서버가 바쁩니다. 잠시 뒤 다시 물어봐 주세요.' } }, { status: 503 }))
  await assert.rejects(send(null), (e: unknown) => e instanceof LlmUnavailableError && /바쁩니다/.test(e.message))
})

/** SSE 조각 몇 개를 흘리고, `broken`이면 끝내지 않고 연결이 끊긴 것처럼 실패하는 응답 본문 */
function sseBody(lines: string[], broken = false): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(c) {
      for (const line of lines) c.enqueue(encoder.encode(line))
      if (broken) c.error(new TypeError('network error')); else c.close()
    },
  })
}

test('기본 제공 AI가 답을 보내다 멈춰 스트림에 오류 줄을 보내면, 그 안내로 잠시 뒤 다시 하면 되는 실패', async () => {
  const stall = `data: ${JSON.stringify({ error: { message: '판정 서버가 쉬는 중입니다 — 답을 보내다 멈췄습니다.' } })}\n\n`
  answerWith(new Response(sseBody([`data: ${JSON.stringify({ choices: [{ delta: { content: '물총' } }] })}\n\n`, stall])))
  await assert.rejects(send(null), (e: unknown) => e instanceof LlmUnavailableError && /답을 보내다 멈췄습니다/.test(e.message))
})

test('답을 받다가 연결이 끊기면 영어 network error 대신 한국어 안내 — 잠시 뒤 다시 하면 되는 실패로', async () => {
  answerWith(new Response(sseBody([`data: ${JSON.stringify({ choices: [{ delta: { content: '물총' } }] })}\n\n`], true)))
  await assert.rejects(send(null), (e: unknown) => e instanceof LlmUnavailableError && /연결이 끊겼습니다/.test(e.message))
  answerWith(new Response(sseBody([], true)))
  await assert.rejects(send(OWN), (e: unknown) => e instanceof LlmUnavailableError && /내 API 키의 서비스와 연결이 끊겼습니다/.test(e.message))
})

test('사용자가 멈춘 판정은 안내로 바꾸지 않고 그대로 던진다 — 화면이 "멈춤"과 "실패"를 가른다', async () => {
  const ctrl = new AbortController()
  answerWith(new Response(new ReadableStream<Uint8Array>({ start(c) { ctrl.abort(); c.error(new DOMException('중단', 'AbortError')) } })))
  await assert.rejects(chat(null, [], [], 'auto', ctrl.signal, () => {}), (e: unknown) => !(e instanceof LlmUnavailableError))
})
