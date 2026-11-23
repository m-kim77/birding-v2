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

/** CSP 한 줄을 지시어마다 값 목록으로 나눈다 ("script-src 'self' x; …" → { 'script-src': ["'self'", 'x'] }). 빈 글이면 빈 객체 */
function cspOf(value: string): Record<string, string[]> {
  const parts = value.split(';').map((p) => p.trim().split(/\s+/)).filter((p) => p[0])
  return Object.fromEntries(parts.map(([name, ...sources]) => [name, sources]))
}

const csp = cspOf(headerOf(ALL, 'Content-Security-Policy') ?? '')

test('CSP: 스크립트는 우리 사이트와 구글 로그인 창 스크립트 하나에서만 받는다 — 바깥 CDN의 코드(예: jsDelivr의 새 찾기 실행 파일)는 앱과 같은 권한으로 돌아 API 키·기록·드라이브 출입증에 닿는다', () => {
  // accounts.google.com 전체를 열면 같은 호스트의 JSONP 주소(callback=…)로 CSP를 넘을 수 있다 — 앱이 받는 주소(gis.ts SCRIPT) 하나만 연다
  assert.deepEqual([...(csp['script-src'] ?? [])].sort(), ["'self'", "'wasm-unsafe-eval'", 'https://accounts.google.com/gsi/client'])
  const gis = readFileSync(new URL('../src/lib/google/gis.ts', import.meta.url), 'utf8')
  assert.equal(gis.match(/const SCRIPT = '([^']+)'/)?.[1], 'https://accounts.google.com/gsi/client')
  assert.deepEqual(csp['default-src'], ["'self'"])
  assert.deepEqual(csp['object-src'], ["'none'"])
  assert.deepEqual(csp['base-uri'], ["'self'"])
})

test('CSP: 앱이 실제로 쓰는 요청·그림은 열려 있다 — 막히면 배포판에서만 드라이브·위키백과·내 API 키·새 찾기·지도가 조용히 깨진다', () => {
  // 드라이브·위키백과·새 찾기 모델·내 API 키(주소를 사용자가 정한다)는 https, 내 컴퓨터의 LLM은 http://localhost, 새 찾기 wasm은 Cache Storage에서 꺼낸 blob 주소
  for (const source of ["'self'", 'https:', 'blob:', 'http://localhost:*', 'http://127.0.0.1:*']) assert.ok(csp['connect-src']?.includes(source), `connect-src ${source}`)
  // 위키백과 참고 사진·지도 그림(https), 기록 사진(blob), Leaflet의 작은 그림(data)
  for (const source of ["'self'", 'https:', 'blob:', 'data:']) assert.ok(csp['img-src']?.includes(source), `img-src ${source}`)
  // 이동 기록을 읽는 작업자(parseWorker)는 우리 사이트의 파일, 구글 로그인 창은 구글 안내(GIS CSP)대로 /gsi/ 아래의 프레임·스타일만 쓸 수 있다
  assert.ok(csp['worker-src']?.includes("'self'"))
  assert.deepEqual(csp['frame-src'], ['https://accounts.google.com/gsi/'])
  assert.ok(csp['style-src']?.includes('https://accounts.google.com/gsi/style'))
  // React·Leaflet의 style 속성과 구글 로그인 창이 넣는 <style>
  assert.ok(csp['style-src']?.includes("'unsafe-inline'"))
})

test('CSP: index.html이 받는 글꼴 CSS의 주인은 style-src에, 글꼴 파일을 받는 곳(crossorigin preconnect)은 font-src에 있다 — 글꼴 CDN을 바꾸고 CSP를 안 고치면 배포판에서만 시스템 글꼴이 된다', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  const sheets = [...html.matchAll(/<link href="(https:\/\/[^/"]+)[^"]*" rel="stylesheet"/g)].map((m) => m[1])
  const fontHosts = [...html.matchAll(/<link rel="preconnect" href="(https:\/\/[^/"]+)" crossorigin/g)].map((m) => m[1])
  // 모양이 바뀌어 하나도 못 찾으면 시험이 아무것도 보지 않게 된다
  assert.ok(sheets.length >= 2 && fontHosts.length >= 2, `${sheets} / ${fontHosts}`)
  for (const origin of sheets) assert.ok(csp['style-src']?.includes(origin), `style-src ${origin}`)
  for (const origin of fontHosts) assert.ok(csp['font-src']?.includes(origin), `font-src ${origin}`)
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

test('Node는 주 버전 하나로 고정한다 ("24.x" 꼴) — ">=22.18"처럼 위가 열리면 Vercel이 새 주 버전이 나온 뒤의 배포에서 말없이 올린다', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { engines?: { node?: string } }
  assert.match(pkg.engines?.node ?? '', /^\d+\.x$/)
})
