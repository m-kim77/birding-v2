import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

/** vercel.json의 함수 설정. 코드가 기대는 값이 여기 있다 — 주석의 약속과 어긋나도 로컬 시험은 모른다 */
const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')) as {
  functions: Record<string, { maxDuration?: number; supportsCancellation?: boolean }>
}

test('기본 제공 AI 함수는 브라우저가 떠나면 멈춘다 (supportsCancellation) — 없으면 배포에서 request.signal이 울리지 않는다', () => {
  assert.equal(config.functions['api/llm.ts']?.supportsCancellation, true)
})
