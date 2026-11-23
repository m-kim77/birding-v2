import test from 'node:test'
import assert from 'node:assert/strict'
import {
  admit, koreanDay, quotaLimitsOf, quotaStoreOf, BUSY_MESSAGE, DAY_MESSAGE, DEFAULT_DAILY_SECONDS, DEFAULT_MAX_CONCURRENT,
  reserveSeconds, STORE_MESSAGE, type QuotaDeps, type QuotaLimits,
} from '../api/_lib/llmQuota.ts'
import { fakeUpstash } from './fakeUpstash.ts'

const STORE = { url: 'https://upstash.test', token: 'test-token' }
// 하루 상한은 미리 적는 몫 몇 개(180초씩)보다 크게 — 동시·열림 시험이 하루 상한에 먼저 걸리지 않게
const LIMITS: QuotaLimits = { dailySeconds: 1000, maxConcurrent: 2, staleMs: 180_000 }
/** 받아들일 때 미리 적는 초 — 최대 실행 시간 */
const RESERVE = reserveSeconds(LIMITS)
/** 한국 시각 2026-11-23 오전 0시 30분 (UTC로는 전날 15시 30분) */
const T0 = Date.UTC(2026, 10, 22, 15, 30)
const DAY_KEY = 'llm:sec:2026-11-23'

// 실패를 흉내 내는 시험이 함수 로그를 어지럽히지 않게
const realWarn = console.warn
test.before(() => { console.warn = () => {} })
test.after(() => { console.warn = realWarn })

/** 가짜 Upstash와 움직이는 시계. `pass`로 시간을 보낸다 */
function world() {
  const up = fakeUpstash()
  let clock = T0
  let n = 0
  const deps: QuotaDeps = { fetch: up.fetch, now: () => clock, newId: () => `id-${++n}`, timeoutMs: 50 }
  return { up, deps, pass: (ms: number) => { clock += ms } }
}

test('koreanDay: 한국 날짜로 자른다 — UTC로는 전날이어도', () => {
  assert.equal(koreanDay(T0), '2026-11-23')
  assert.equal(koreanDay(Date.UTC(2026, 10, 23, 14, 59)), '2026-11-23')
  assert.equal(koreanDay(Date.UTC(2026, 10, 23, 15, 0)), '2026-11-24')
})

test('quotaStoreOf: UPSTASH_ 짝 또는 KV_ 짝, 없으면 null(상한 없음), 반만 있으면 빈 값으로(막는 쪽)', () => {
  assert.equal(quotaStoreOf({}), null)
  assert.deepEqual(quotaStoreOf({ UPSTASH_REDIS_REST_URL: 'https://a.upstash.io/', UPSTASH_REDIS_REST_TOKEN: 't1' }), { url: 'https://a.upstash.io', token: 't1' })
  assert.deepEqual(quotaStoreOf({ KV_REST_API_URL: 'https://b.upstash.io', KV_REST_API_TOKEN: 't2', KV_REST_API_READ_ONLY_TOKEN: 'ro' }), { url: 'https://b.upstash.io', token: 't2' })
  assert.deepEqual(quotaStoreOf({ KV_REST_API_URL: 'https://b.upstash.io' }), { url: 'https://b.upstash.io', token: '' })
})

test('quotaLimitsOf: 환경변수의 값, 비었거나 잘못 적었으면 기본값', () => {
  assert.deepEqual(quotaLimitsOf({}, 1000), { dailySeconds: DEFAULT_DAILY_SECONDS, maxConcurrent: DEFAULT_MAX_CONCURRENT, staleMs: 1000 })
  assert.deepEqual(quotaLimitsOf({ LLM_DAILY_SECONDS: '3600', LLM_MAX_CONCURRENT: '1' }, 1000), { dailySeconds: 3600, maxConcurrent: 1, staleMs: 1000 })
  assert.deepEqual(quotaLimitsOf({ LLM_DAILY_SECONDS: '0', LLM_MAX_CONCURRENT: '많이' }, 1000), { dailySeconds: DEFAULT_DAILY_SECONDS, maxConcurrent: DEFAULT_MAX_CONCURRENT, staleMs: 1000 })
})

test('저장소가 없으면 늘 받아들이고 아무 데도 묻지 않는다', async () => {
  const w = world()
  const a = await admit(null, LIMITS, T0, w.deps)
  assert.equal(a.ok, true)
  if (a.ok) await a.finish()
  assert.equal(w.up.calls.length, 0)
})

test('받아들이면 미리 초를 적고, 끝나면 실제로 쓴 초(올림)로 고치고 열림 표시를 지운다', async () => {
  const w = world()
  const a = await admit(STORE, LIMITS, T0, w.deps)
  assert.equal(a.ok, true)
  assert.equal(w.up.counters.get(DAY_KEY), RESERVE)
  assert.equal(w.up.zsets.get('llm:active')?.size, 1)
  assert.equal(w.up.ttl.get(DAY_KEY), 2 * 86_400_000, '하루 키는 이틀 뒤 사라진다')
  w.pass(4_200)
  if (a.ok) { await a.finish(); await a.finish() }
  assert.equal(w.up.counters.get(DAY_KEY), 5, '두 번 불러도 한 번만 센다')
  assert.equal(w.up.zsets.get('llm:active')?.size, 0)
})

test('미리 적는 초는 최대 실행 시간(올림)이다', () => {
  assert.equal(RESERVE, 180)
  assert.equal(reserveSeconds({ ...LIMITS, staleMs: 170_500 }), 171)
})

test('끝을 적지 못한 요청(브라우저가 끊은 뒤 함수가 멈춤)은 최대 실행 시간만큼 세어진 채 남는다 — 적게 세는 쪽으로 새지 않는다', async () => {
  const w = world()
  assert.equal((await admit(STORE, LIMITS, T0, w.deps)).ok, true)
  w.pass(169_000)
  assert.equal(w.up.counters.get(DAY_KEY), 180)
})

test('끝을 적다 Upstash가 실패하면 최대 실행 시간만큼 센 채로 남는다', async () => {
  const w = world()
  const a = await admit(STORE, LIMITS, T0, w.deps)
  w.pass(2_000)
  w.up.state.mode = 'down'
  if (a.ok) await a.finish()
  assert.equal(w.up.counters.get(DAY_KEY), 180)
})

test('Upstash에는 토큰과 숫자만 간다 — /multi-exec, Bearer 토큰, 명령 이름·키·숫자·무작위 id', async () => {
  const w = world()
  await admit(STORE, LIMITS, T0, w.deps)
  assert.equal(w.up.calls[0].url, 'https://upstash.test/multi-exec')
  assert.equal(w.up.calls[0].auth, 'Bearer test-token')
  assert.deepEqual(w.up.calls[0].commands.map((c) => c[0]), ['ZREMRANGEBYSCORE', 'ZADD', 'ZCARD', 'INCRBY', 'EXPIRE', 'PEXPIRE'])
  assert.deepEqual(w.up.calls[0].commands[1], ['ZADD', 'llm:active', String(T0), 'id-1'])
})

test('동시에 열린 요청이 상한을 넘으면 429 busy — 올린 표시와 미리 적은 초는 되돌린다', async () => {
  const w = world()
  assert.equal((await admit(STORE, LIMITS, T0, w.deps)).ok, true)
  assert.equal((await admit(STORE, LIMITS, T0, w.deps)).ok, true)
  const third = await admit(STORE, LIMITS, T0, w.deps)
  assert.deepEqual(third, { ok: false, status: 429, reason: 'busy', message: BUSY_MESSAGE })
  assert.equal(w.up.zsets.get('llm:active')?.size, 2)
  assert.equal(w.up.counters.get(DAY_KEY), 2 * RESERVE)
})

test('끝을 적지 못하고 죽은 요청의 열림 표시는 최대 실행 시간이 지나면 버려져 자리를 막지 않는다', async () => {
  const w = world()
  await admit(STORE, LIMITS, T0, w.deps)
  await admit(STORE, LIMITS, T0, w.deps)
  w.pass(LIMITS.staleMs + 1)
  assert.equal((await admit(STORE, LIMITS, T0 + LIMITS.staleMs + 1, w.deps)).ok, true)
  assert.equal(w.up.zsets.get('llm:active')?.size, 1)
})

test('오늘 쓴 시간이 상한에 닿았으면 429 day — 미리 적은 초는 되돌린다', async () => {
  const w = world()
  w.up.counters.set(DAY_KEY, LIMITS.dailySeconds)
  const a = await admit(STORE, LIMITS, T0, w.deps)
  assert.deepEqual(a, { ok: false, status: 429, reason: 'day', message: DAY_MESSAGE })
  assert.equal(w.up.counters.get(DAY_KEY), LIMITS.dailySeconds)
  assert.equal(w.up.zsets.get('llm:active')?.size, 0)
})

test('상한 바로 아래면 받아들인다 — 미리 적은 초 때문에 막지 않는다', async () => {
  const w = world()
  w.up.counters.set(DAY_KEY, LIMITS.dailySeconds - 1)
  assert.equal((await admit(STORE, LIMITS, T0, w.deps)).ok, true)
})

test('날이 바뀌면 새 하루 키로 센다 (한국 자정)', async () => {
  const w = world()
  w.up.counters.set(DAY_KEY, LIMITS.dailySeconds)
  w.pass(24 * 3_600_000)
  assert.equal((await admit(STORE, LIMITS, T0, w.deps)).ok, true)
  assert.equal(w.up.counters.get('llm:sec:2026-11-24'), RESERVE)
})

test('Upstash가 오류로 답하거나·닿지 않거나·늦거나·명령이 실패하면 503으로 막는다 (상한을 끄지 않는다)', async () => {
  for (const mode of ['down', 'throw', 'hang', 'cmd-error'] as const) {
    const w = world()
    w.up.state.mode = mode
    const started = Date.now()
    assert.deepEqual(await admit(STORE, LIMITS, T0, w.deps), { ok: false, status: 503, reason: 'store', message: STORE_MESSAGE }, mode)
    assert.ok(Date.now() - started < 1000, `${mode}: 짧게 기다리고 끝낸다`)
  }
})

test('반만 넣은 설정(주소 없이 토큰만)도 상한을 끄지 않고 503으로 막는다', async () => {
  // 실제 fetch로 — 빈 주소는 네트워크에 나가기 전에 실패한다
  const a = await admit(quotaStoreOf({ KV_REST_API_TOKEN: 'x' }), LIMITS, T0)
  assert.deepEqual(a, { ok: false, status: 503, reason: 'store', message: STORE_MESSAGE })
})

test('끝을 적다 Upstash가 실패해도 던지지 않는다 — 열림 표시는 최대 실행 시간 뒤 버려진다', async () => {
  const w = world()
  const a = await admit(STORE, LIMITS, T0, w.deps)
  w.up.state.mode = 'down'
  if (a.ok) await a.finish()
})
