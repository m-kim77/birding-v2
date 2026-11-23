import test from 'node:test'
import assert from 'node:assert/strict'
import { crossSiteFetch, sameOrigin } from '../api/_lib/origin.ts'

/** 머리말을 단 요청 하나 */
const req = (headers: Record<string, string>, url = 'https://birding.example/api/llm') => new Request(url, { method: 'POST', headers })

test('sameOrigin: Origin이 함수 주소와 같을 때만 — 다른 사이트·Origin 없음·다른 포트는 거절', () => {
  assert.equal(sameOrigin(req({ origin: 'https://birding.example' })), true)
  assert.equal(sameOrigin(req({ origin: 'https://evil.example' })), false)
  assert.equal(sameOrigin(req({})), false)
  assert.equal(sameOrigin(req({ origin: 'http://birding.example' })), false)
  assert.equal(sameOrigin(req({ origin: 'http://localhost:5173' }, 'http://localhost:5173/api/llm')), true)
})

test('crossSiteFetch: sec-fetch-site가 same-origin이 아니면 다른 사이트가 시킨 것 — 머리말이 없으면(오래된 브라우저·curl) 막지 않는다', () => {
  assert.equal(crossSiteFetch(req({ 'sec-fetch-site': 'same-origin' })), false)
  assert.equal(crossSiteFetch(req({})), false)
  assert.equal(crossSiteFetch(req({ 'sec-fetch-site': 'cross-site' })), true)
  assert.equal(crossSiteFetch(req({ 'sec-fetch-site': 'same-site' })), true)
  assert.equal(crossSiteFetch(req({ 'sec-fetch-site': 'none' })), true)
})
