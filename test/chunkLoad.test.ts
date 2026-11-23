import test from 'node:test'
import assert from 'node:assert/strict'
import { ChunkLoadError, RELOAD_GUARD_MS, holdingReload, mayAutoReload, reloadHeld, retryOnce } from '../src/app/chunkLoad.ts'

/** 정해진 차례대로 실패·성공하는 가짜 import. 부른 횟수를 센다 */
function loader(results: Array<'fail' | 'ok'>) {
  let calls = 0
  const load = async () => {
    const r = results[calls] ?? 'fail'
    calls += 1
    if (r === 'fail') throw new TypeError('Failed to fetch dynamically imported module')
    return { default: 'screen' }
  }
  return { load, calls: () => calls }
}

test('retryOnce: 한 번 실패하면 기다렸다가 한 번 더 받는다 — 잠깐 끊긴 신호면 화면이 열린다', async () => {
  const l = loader(['fail', 'ok'])
  assert.deepEqual(await retryOnce(l.load, 1), { default: 'screen' })
  assert.equal(l.calls(), 2)
})

test('retryOnce: 두 번 다 실패하면 ChunkLoadError — 세 번째는 하지 않는다', async () => {
  const l = loader(['fail', 'fail', 'ok'])
  await assert.rejects(retryOnce(l.load, 1), (e: unknown) => e instanceof ChunkLoadError && e.reason instanceof TypeError)
  assert.equal(l.calls(), 2)
})

test('retryOnce: 처음에 받으면 다시 받지 않는다', async () => {
  const l = loader(['ok'])
  await retryOnce(l.load, 1)
  assert.equal(l.calls(), 1)
})

test('mayAutoReload: 온라인이고 저절로 새로 고친 적이 없거나 오래됐을 때만', () => {
  const now = 1_000_000_000
  assert.equal(mayAutoReload(null, now, true), true)
  assert.equal(mayAutoReload(now - RELOAD_GUARD_MS - 1, now, true), true)
  // 방금 새로 고쳤는데도 또 못 받았다 — 다시 하면 끝없이 돈다
  assert.equal(mayAutoReload(now - 1_000, now, true), false)
  // 오프라인에서 새로 고치면 앱 자체가 안 열린다 (서비스 워커 없음)
  assert.equal(mayAutoReload(null, now, false), false)
  // 저장소가 막혀 지난 시각을 모르면 하지 않는다
  assert.equal(mayAutoReload('unknown', now, true), false)
  // 시계가 뒤로 갔으면 오래된 것으로 본다
  assert.equal(mayAutoReload(now + 60_000, now, true), true)
})

test('holdingReload: 받는 동안만 막고, 실패해도 풀린다', async () => {
  let during = false
  await holdingReload(async () => { during = reloadHeld() })
  assert.equal(during, true)
  assert.equal(reloadHeld(), false)
  await assert.rejects(holdingReload(async () => { throw new Error('x') }))
  assert.equal(reloadHeld(), false)
})
