import test from 'node:test'
import assert from 'node:assert/strict'
import { runIdentify } from '../src/features/identify/loop.ts'
import type { OwnKey } from '../src/features/identify/connection.ts'

const OWN: OwnKey = { baseUrl: 'https://example.test/v1', apiKey: 'sk-test', model: 'vision-1' }
const realFetch = globalThis.fetch
test.afterEach(() => { globalThis.fetch = realFetch })

/** 모델이 search_wikipedia를 한 번 부르는 스트림 답 */
function toolCallStream(): Response {
  const event = { choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', function: { name: 'search_wikipedia', arguments: '{"query":"까치"}' } }] } }] }
  return new Response(`data: ${JSON.stringify(event)}\n\ndata: [DONE]\n\n`)
}

/**
 * 가짜 fetch. LLM은 늘 도구를 부르고, 위키백과는 빈 검색 결과를 준다. 진짜 fetch처럼 이미 멈춘 신호면 AbortError로 거절한다.
 * 부른 횟수를 곳마다 센다.
 */
function fakeServices() {
  const calls = { llm: 0, wiki: 0 }
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.signal?.aborted) throw new DOMException('This operation was aborted', 'AbortError')
    if (String(input).includes('wikipedia.org')) { calls.wiki += 1; return Response.json({ query: { search: [] } }) }
    calls.llm += 1
    return toolCallStream()
  }) as typeof fetch
  return calls
}

test('도구를 부르는 사이에 판정을 멈추면 그 도구를 돌리지 않고 AbortError로 끝난다 (두 번 누르기 · 사진 바꾸기)', async () => {
  const calls = fakeServices()
  const ctrl = new AbortController()
  const run = runIdentify({
    imageDataUrl: 'data:image/jpeg;base64,AAAA', context: {}, own: OWN, signal: ctrl.signal,
    // 모델이 도구를 부르겠다고 한 바로 그때 사용자가 다시 눌렀다
    onEvent: (e) => { if (e.type === 'tool') ctrl.abort() },
  })
  await assert.rejects(run, (e: unknown) => e instanceof DOMException && e.name === 'AbortError')
  assert.equal(calls.wiki, 0)
  assert.equal(calls.llm, 1)
})

test('멈추기 전에 고른 도구는 돌리고, 멈춘 뒤의 다음 도구부터 돌리지 않는다', async () => {
  const calls = fakeServices()
  const ctrl = new AbortController()
  let tools = 0
  const run = runIdentify({
    imageDataUrl: 'data:image/jpeg;base64,AAAA', context: {}, own: OWN, signal: ctrl.signal,
    // 첫 도구는 그대로 돌고, 두 번째 턴에서 도구를 부르려 할 때 멈춘다
    onEvent: (e) => { if (e.type === 'tool' && ++tools === 2) ctrl.abort() },
  })
  await assert.rejects(run, (e: unknown) => e instanceof DOMException && e.name === 'AbortError')
  assert.equal(calls.wiki, 1)
  assert.equal(calls.llm, 2)
})
