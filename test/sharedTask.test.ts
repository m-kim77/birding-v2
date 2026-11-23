import test from 'node:test'
import assert from 'node:assert/strict'
import { shareInFlight } from '../src/lib/sharedTask.ts'

/** 손으로 끝낼 수 있는 가짜 준비. 몇 번 시작했는지와 마지막에 받은 진행률 알리기를 남긴다 */
function fakePrepare() {
  const state = { starts: 0, report: (_: number) => {}, finish: () => {}, fail: (_: Error) => {} }
  const prepare = (report: (fraction: number) => void) => {
    state.starts += 1
    state.report = report
    return new Promise<void>((resolve, reject) => { state.finish = resolve; state.fail = reject })
  }
  return { prepare, state }
}

test('shareInFlight: 동시에 두 곳이 부르면 준비는 한 번 — 탐지기가 둘 생기지 않는다', async () => {
  const f = fakePrepare()
  const load = shareInFlight(f.prepare)
  const a = load(() => {})
  const b = load(() => {})
  assert.equal(f.state.starts, 1)
  f.state.finish()
  await Promise.all([a, b])
  assert.equal(f.state.starts, 1)
})

test('shareInFlight: 진행률은 함께 기다리는 모두에게 간다', async () => {
  const f = fakePrepare()
  const load = shareInFlight(f.prepare)
  const seenA: number[] = [], seenB: number[] = []
  const a = load((x) => seenA.push(x))
  const b = load((x) => seenB.push(x))
  f.state.report(0.5)
  f.state.finish()
  await Promise.all([a, b])
  assert.deepEqual(seenA, [0.5])
  assert.deepEqual(seenB, [0.5])
})

test('shareInFlight: 끝나면(성공·실패) 진행률 받기를 지운다 — 다음 준비의 진행률이 옛 화면으로 가지 않는다', async () => {
  const f = fakePrepare()
  const load = shareInFlight(f.prepare)
  const seen: number[] = []
  const a = load((x) => seen.push(x))
  f.state.finish()
  await a
  f.state.report(0.9)
  assert.deepEqual(seen, [])

  const failed: number[] = []
  const b = load((x) => failed.push(x))
  f.state.fail(new Error('새 찾기 모델을 받지 못했습니다.'))
  await assert.rejects(b)
  f.state.report(0.3)
  assert.deepEqual(failed, [])
})

test('shareInFlight: 실패하면 기다리던 모두가 같은 오류를 받고, 다음 부름은 새로 준비한다', async () => {
  const f = fakePrepare()
  const load = shareInFlight(f.prepare)
  const a = load(() => {})
  const b = load(() => {})
  const err = new Error('새 찾기 모델을 준비하지 못했습니다. 인터넷 연결을 확인해 주세요.')
  f.state.fail(err)
  await assert.rejects(a, (e) => e === err)
  await assert.rejects(b, (e) => e === err)
  const c = load(() => {})
  assert.equal(f.state.starts, 2, '실패를 기억하면 다시 받기를 눌러도 영영 같은 오류다')
  f.state.finish()
  await c
})

test('shareInFlight: 끝난 뒤의 부름은 새로 준비한다 (다 됐는지는 부르는 쪽이 본다)', async () => {
  const f = fakePrepare()
  const load = shareInFlight(f.prepare)
  const a = load(() => {})
  f.state.finish()
  await a
  const b = load(() => {})
  assert.equal(f.state.starts, 2)
  f.state.finish()
  await b
})
