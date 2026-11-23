import test from 'node:test'
import assert from 'node:assert/strict'
import { detectIfLatest, latestOnly, type DetectSink } from '../src/features/record/detectLatest.ts'
import type { DetectBox } from '../src/types.ts'

/** 손으로 끝낼 수 있는 가짜 탐지기. 준비(load)는 하나를 함께 기다리고, 찾기(detect)는 부를 때마다 따로 끝낸다 */
function fakeDetector() {
  let finishLoad = () => {}
  const loading = new Promise<void>((resolve) => { finishLoad = resolve })
  const detects: Array<{ target: unknown; finish: (boxes: DetectBox[]) => void; fail: (e: Error) => void }> = []
  const detector = {
    load: async (_: (fraction: number) => void) => loading,
    detect: (target: ImageBitmap) => new Promise<DetectBox[]>((finish, fail) => { detects.push({ target, finish, fail }) }),
  }
  return { detector, finishLoad: () => finishLoad(), detects }
}

/** 화면 상태 대신 쓴 것을 모은다 */
function sink() {
  const wrote: Array<{ found?: DetectBox[]; failed?: string }> = []
  const s: DetectSink = { progress: () => {}, found: (b) => wrote.push({ found: b }), failed: (m) => wrote.push({ failed: m }) }
  return { s, wrote }
}

const box: DetectBox = { score: 0.9, x1: 0.1, y1: 0.1, x2: 0.5, y2: 0.5 }
const tick = () => new Promise((r) => setTimeout(r, 0))
const photo = (name: string) => ({ name }) as unknown as ImageBitmap

test('latestOnly: 뒤에 번호를 뽑으면 앞 번호는 그 뒤로 늘 거짓', () => {
  const next = latestOnly()
  const a = next()
  assert.equal(a(), true)
  const b = next()
  assert.equal(a(), false)
  assert.equal(b(), true)
  next()
  assert.equal(b(), false)
})

test('detectIfLatest: 준비 중에 사진을 바꾸면 옛 사진은 찾지도 않고, 새 사진의 결과만 쓴다', async () => {
  const f = fakeDetector()
  const out = sink()
  const next = latestOnly()
  const first = detectIfLatest(f.detector, photo('old'), next(), out.s)
  const second = detectIfLatest(f.detector, photo('new'), next(), out.s)
  f.finishLoad()
  await tick()
  assert.equal(f.detects.length, 1, '옛 사진은 이미 닫힌 비트맵이다 — 그리러 가지 않는다')
  assert.deepEqual(f.detects[0].target, { name: 'new' })
  f.detects[0].finish([box])
  await Promise.all([first, second])
  assert.deepEqual(out.wrote, [{ found: [box] }])
})

test('detectIfLatest: 찾는 중에 사진을 바꾸면 옛 탐지의 오류(닫힌 비트맵)는 새 사진에 붙지 않는다', async () => {
  const f = fakeDetector()
  f.finishLoad()
  const out = sink()
  const next = latestOnly()
  const first = detectIfLatest(f.detector, photo('old'), next(), out.s)
  await tick()
  const second = detectIfLatest(f.detector, photo('new'), next(), out.s)
  await tick()
  assert.equal(f.detects.length, 2)
  // 옛 탐지가 나중에 영어 오류로 끝난다
  f.detects[0].fail(new Error('The image source is detached'))
  f.detects[1].finish([])
  await Promise.all([first, second])
  assert.deepEqual(out.wrote, [{ found: [] }])
})

test('detectIfLatest: 가장 나중 탐지의 실패는 안내로 쓴다 — Error가 아니면 한국어 기본 문구', async () => {
  const out = sink()
  const next = latestOnly()
  const failing = { load: async () => { throw new Error('새 찾기 모델을 받지 못했습니다.') }, detect: async () => [] }
  await detectIfLatest(failing, photo('a'), next(), out.s)
  const odd = { load: async () => {}, detect: async () => { throw 'x' } }
  await detectIfLatest(odd, photo('b'), next(), out.s)
  assert.deepEqual(out.wrote, [{ failed: '새 찾기 모델을 받지 못했습니다.' }, { failed: '새를 찾지 못했습니다.' }])
})
