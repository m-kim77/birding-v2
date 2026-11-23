import test from 'node:test'
import assert from 'node:assert/strict'
import { prefetchLater, type PrefetchEnv } from '../src/app/prefetch.ts'

/** 미리 받기의 가짜 브라우저. `fire()`가 '나중'을 부른다. 취소됐는지도 센다 */
function fakeEnv(online: boolean) {
  let pending: (() => void) | null = null
  let cancelled = 0
  const env: PrefetchEnv = {
    online: () => online,
    later: (run) => { pending = run; return () => { cancelled += 1; pending = null } },
  }
  return { env, fire: () => pending?.(), cancelled: () => cancelled }
}

/** 부른 횟수를 세는 가짜 import. fail이면 거절한다 */
function loader(fail = false) {
  let calls = 0
  const load = async () => { calls += 1; if (fail) throw new TypeError('Failed to fetch dynamically imported module'); return { default: 'screen' } }
  return { load, calls: () => calls }
}

/** 미리 받기가 Promise 안에서 부르므로 한 박자 기다린다 */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

test('prefetchLater: 곧바로 받지 않고 나중에 한 번씩 받는다 — 첫 화면을 그리는 동안 끼어들지 않게', async () => {
  const f = fakeEnv(true)
  const a = loader(), b = loader()
  prefetchLater([a.load, b.load], f.env)
  await tick()
  assert.deepEqual([a.calls(), b.calls()], [0, 0])
  f.fire()
  await tick()
  assert.deepEqual([a.calls(), b.calls()], [1, 1])
})

test('prefetchLater: 그때 오프라인이면 아무것도 받지 않는다 — 받아 봐야 실패하고 브라우저가 그 실패를 기억한다', async () => {
  const f = fakeEnv(false)
  const a = loader()
  prefetchLater([a.load], f.env)
  f.fire()
  await tick()
  assert.equal(a.calls(), 0)
})

test('prefetchLater: 하나가 실패하거나 곧바로 던져도 나머지는 받고, 실패가 밖으로 새지 않는다', async () => {
  const f = fakeEnv(true)
  const bad = loader(true), good = loader()
  const throws = () => { throw new Error('곧바로 던짐') }
  prefetchLater([bad.load, throws as () => Promise<unknown>, good.load], f.env)
  f.fire()
  await tick()
  // 거절이 잡히지 않았으면 node --test가 이 파일을 실패로 친다 (unhandledRejection)
  assert.deepEqual([bad.calls(), good.calls()], [1, 1])
})

test('prefetchLater: 돌려준 함수로 취소하면 받지 않는다 — 화면을 금방 떠났을 때 (useEffect 정리)', async () => {
  const f = fakeEnv(true)
  const a = loader()
  const cancel = prefetchLater([a.load], f.env)
  cancel()
  f.fire()
  await tick()
  assert.equal(a.calls(), 0)
  assert.equal(f.cancelled(), 1)
})
