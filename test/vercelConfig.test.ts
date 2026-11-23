import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { MAX_DURATION_SECONDS, TURN_SECONDS } from '../api/llm.ts'

/** vercel.json의 함수·머리(header)·지역 설정. 코드가 기대는 값이 여기 있다 — 주석의 약속과 어긋나도 로컬 시험은 모른다 */
const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')) as {
  functions: Record<string, { maxDuration?: number; supportsCancellation?: boolean }>
  headers?: { source: string; headers: { key: string; value: string }[] }[]
  regions?: string[]
}

/** 모든 경로에 붙는 머리의 source (Vercel의 path-to-regexp 문법 — '/'도 맞는다) */
const ALL = '/(.*)'

/**
 * source가 정확히 그 문자열인 규칙에서 key 머리의 값을 꺼낸다. 이름은 대소문자를 가리지 않는다(HTTP 머리처럼).
 * 그런 규칙이나 머리가 없으면 undefined.
 */
function headerOf(source: string, key: string): string | undefined {
  const rule = config.headers?.find((r) => r.source === source)
  return rule?.headers.find((h) => h.key.toLowerCase() === key.toLowerCase())?.value
}

test('기본 제공 AI 함수는 브라우저가 떠나면 멈춘다 (supportsCancellation) — 없으면 배포에서 request.signal이 울리지 않는다', () => {
  assert.equal(config.functions['api/llm.ts']?.supportsCancellation, true)
})

test('기본 제공 AI 함수의 최대 실행 시간은 코드의 값과 같고, 한 턴 마감은 그보다 앞이다 — 어긋나면 Vercel이 먼저 끊어 안내도 사용량 기록도 없이 끝난다', () => {
  assert.equal(config.functions['api/llm.ts']?.maxDuration, MAX_DURATION_SECONDS)
  assert.ok(TURN_SECONDS < MAX_DURATION_SECONDS)
})

test('모든 경로에 iframe 막기·형식 추측 끄기·리퍼러 줄이기 머리가 붙는다 — 없으면 남의 페이지가 앱을 투명하게 덮어 삭제를 누르게 할 수 있다', () => {
  assert.equal(headerOf(ALL, 'X-Frame-Options'), 'DENY')
  // 나중에 CSP에 다른 규칙이 더해져도 frame-ancestors는 남아야 한다. X-Frame-Options는 CSP를 모르는 옛 브라우저 몫이라 둘 다 둔다
  assert.match(headerOf(ALL, 'Content-Security-Policy') ?? '', /frame-ancestors 'none'/)
  assert.equal(headerOf(ALL, 'X-Content-Type-Options'), 'nosniff')
  assert.equal(headerOf(ALL, 'Referrer-Policy'), 'strict-origin-when-cross-origin')
})

test('이름에 내용 해시가 붙은 /assets/ 파일만 1년 동안 다시 묻지 않는다 — 없으면 앱을 열 때마다 묻고, 신호가 끊긴 곳에서는 처음 여는 화면을 못 연다', () => {
  assert.equal(headerOf('/assets/(.*)', 'Cache-Control'), 'public, max-age=31536000, immutable')
  // index.html·privacy.html·아이콘은 이름이 그대로라, 오래 기억하면 새 배포가 안 보인다 — 다른 규칙에는 캐시 머리를 두지 않는다
  const others = (config.headers ?? []).filter((r) => r.source !== '/assets/(.*)')
  for (const rule of others) assert.equal(headerOf(rule.source, 'Cache-Control'), undefined, rule.source)
  // public/assets/에 둔 파일은 해시 없이 dist/assets/로 복사되어, 바꿔도 1년 동안 옛 판이 쓰인다
  assert.equal(existsSync(new URL('../public/assets', import.meta.url)), false)
})

test('함수는 서울(icn1) 한 곳에서 돈다 — 기본값 iad1(미국 동부)이면 한국 사용자와 한국의 맥 사이를 요청마다 태평양을 두 번 건넌다, Hobby는 둘 이상이면 배포가 실패한다', () => {
  assert.deepEqual(config.regions, ['icn1'])
})
