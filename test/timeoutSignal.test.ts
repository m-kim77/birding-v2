import test from 'node:test'
import assert from 'node:assert/strict'
import { fallbackTimeoutSignal, timeoutSignal } from '../src/lib/timeoutSignal.ts'
import { wikiQuery } from '../src/features/identify/tools/wikipedia.ts'

const realFetch = globalThis.fetch
const realTimeout = AbortSignal.timeout
const realSetTimeout = globalThis.setTimeout
test.afterEach(() => {
  globalThis.fetch = realFetch
  AbortSignal.timeout = realTimeout
  globalThis.setTimeout = realSetTimeout
})

/**
 * iOS 15처럼 AbortSignal.timeout이 없는 브라우저를 흉내 낸다 (afterEach가 되돌린다).
 * 대신 만든 신호의 타이머(위키백과는 10초)가 시험을 붙잡지 않게 unref한 setTimeout으로 바꿔 끼운다.
 */
function withoutAbortSignalTimeout(): void {
  ;(AbortSignal as { timeout?: unknown }).timeout = undefined
  globalThis.setTimeout = ((fn: () => void, ms?: number) => realSetTimeout(fn, ms).unref()) as typeof setTimeout
}

test('대신 만든 신호는 정한 시간이 지나면 TimeoutError로 멈춘다', async () => {
  const signal = fallbackTimeoutSignal(5)
  assert.equal(signal.aborted, false)
  await new Promise((r) => setTimeout(r, 30))
  assert.equal(signal.aborted, true)
  assert.equal((signal.reason as DOMException).name, 'TimeoutError')
})

test('AbortSignal.timeout이 없으면 대신 만든 신호를 준다 — 던지지 않는다', () => {
  withoutAbortSignalTimeout()
  const signal = timeoutSignal(1_000)
  assert.equal(signal instanceof AbortSignal, true)
  assert.equal(signal.aborted, false)
})

test('iOS 15(AbortSignal.timeout 없음)에서도 위키백과 요청을 실제로 보내 답을 받는다', async () => {
  withoutAbortSignalTimeout()
  let asked = 0
  globalThis.fetch = (async () => {
    asked += 1
    return Response.json({ query: { pages: {} } })
  }) as typeof fetch
  const data = await wikiQuery('ko', { titles: '까치' })
  assert.equal(asked, 1)
  assert.deepEqual(data, { query: { pages: {} } })
})
