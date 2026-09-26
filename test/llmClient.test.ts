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

test('내 키 서비스의 429는 그 서비스가 준 안내를 그대로', async () => {
  answerWith(Response.json({ error: { message: 'You exceeded your current quota' } }, { status: 429 }))
  await assert.rejects(send(OWN), (e: unknown) => e instanceof Error && !(e instanceof LlmUnavailableError) && /exceeded your current quota/.test(e.message))
})

test('503은 서버가 보낸 이유 그대로 — 첫 응답 마감의 "바쁩니다"', async () => {
  answerWith(Response.json({ error: { message: '판정 서버가 바쁩니다. 잠시 뒤 다시 물어봐 주세요.' } }, { status: 503 }))
  await assert.rejects(send(null), (e: unknown) => e instanceof LlmUnavailableError && /바쁩니다/.test(e.message))
})
