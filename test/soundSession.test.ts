import test from 'node:test'
import assert from 'node:assert/strict'
import { makeFakeClassifier } from '../src/features/sound/fakeClassifier.ts'
import type { HeardSpecies } from '../src/features/sound/heard.ts'
import { makeSession } from '../src/features/sound/session.ts'
import { MODEL_RATE, MODEL_SAMPLES } from '../src/features/sound/windows.ts'
import type { SoundGuess } from '../src/features/sound/classifier.ts'

/** 소리가 있는 조각 (초 단위 길이) */
const noise = (seconds: number, rate = MODEL_RATE) => Float32Array.from({ length: Math.round(seconds * rate) }, (_, i) => (i % 2 ? 0.2 : -0.2))
const tit: SoundGuess = { latin: 'Parus minor', en: 'Japanese Tit', ko: '박새', score: 0.9 }

/** 듣기 하나와, 그 듣기가 알려 온 것들 */
function listen(classify: (s: Float32Array) => Promise<SoundGuess[]>, live = false, rate = MODEL_RATE) {
  const seen = { heard: [] as HeardSpecies[], judged: 0, updates: 0, errors: [] as string[] }
  const session = makeSession({
    classify, rate, live,
    onUpdate: (heard, judged) => { seen.heard = heard; seen.judged = judged; seen.updates++ },
    onError: (message) => seen.errors.push(message),
  })
  return { session, seen }
}

test('가짜 판정기: 준비 전에는 판정하지 않고, 받기 진행률은 0.1 → 1', async () => {
  const fake = makeFakeClassifier({ stepMs: 0 })
  assert.equal(fake.demo, true)
  assert.equal(await fake.isCached(), false)
  await assert.rejects(fake.classify(new Float32Array(MODEL_SAMPLES)), /준비되지 않았습니다/)
  const progress: number[] = []
  await fake.load((f) => progress.push(f))
  assert.equal(progress[0], 0.1)
  assert.equal(progress.at(-1), 1)
  assert.ok(progress.every((f, i) => i === 0 || f >= progress[i - 1]), '뒤로 가지 않는다')
  assert.equal(await fake.isCached(), true)
  await fake.clearCache()
  assert.equal(await fake.isCached(), false)
  await assert.rejects(fake.classify(new Float32Array(MODEL_SAMPLES)), /준비되지 않았습니다/)
})

test('가짜 판정기: 조용한 창은 빈 답, 소리가 있으면 0~1 점수의 답, 길이가 다른 창은 거절', async () => {
  const fake = makeFakeClassifier({ stepMs: 0 })
  await fake.load(() => undefined)
  assert.deepEqual(await fake.classify(new Float32Array(MODEL_SAMPLES)), [])
  for (let i = 0; i < 8; i++) {
    for (const g of await fake.classify(noise(3))) assert.ok(g.latin && g.score >= 0 && g.score <= 1)
  }
  await assert.rejects(fake.classify(new Float32Array(100)), /길이/)
})

test('듣기: 12초 소리를 가짜 판정기로 — 새가 아닌 줄과 낮은 점수는 빠지고, 끊겼다 다시 들린 종은 덩어리가 둘', async () => {
  const fake = makeFakeClassifier({ stepMs: 0 })
  await fake.load(() => undefined)
  const { session, seen } = listen((s) => fake.classify(s))
  // 0.5초씩 흘려 넣는다 (마이크처럼)
  for (let t = 0; t < 12; t += 0.5) session.push(noise(0.5))
  await session.finish()
  assert.deepEqual(seen.errors, [])
  assert.equal(seen.updates, 7, '0 · 1.5 · … · 9초에서 시작하는 창 일곱')
  assert.equal(seen.judged, 12)
  const byLatin = Object.fromEntries(seen.heard.map((h) => [h.latin, h]))
  assert.deepEqual(Object.keys(byLatin).sort(), ['Halcyon coromanda', 'Hypsipetes amaurotis', 'Parus minor', 'Ramphocaenus melanurus'])
  assert.deepEqual(byLatin['Parus minor'].spans, [[0, 4.5]])
  assert.equal(byLatin['Parus minor'].peak, 0.91)
  assert.deepEqual(byLatin['Hypsipetes amaurotis'].spans, [[1.5, 6]])
})

test('듣기: 3초보다 짧은 소리도 끝낼 때 창 하나로 판정한다', async () => {
  const { session, seen } = listen(async () => [tit])
  session.push(noise(1.9))
  assert.equal(seen.updates, 0)
  await session.finish()
  assert.equal(seen.updates, 1)
  assert.deepEqual(seen.heard[0].spans, [[0, 3]])
})

test('듣기: 판정기에는 늘 48kHz 144,000개가 간다 (마이크가 44.1kHz여도)', async () => {
  const lengths: number[] = []
  const { session } = listen(async (s) => { lengths.push(s.length); return [] }, false, 44100)
  session.push(noise(4, 44100))
  await session.finish()
  assert.deepEqual(lengths, [MODEL_SAMPLES, MODEL_SAMPLES])
})

test('듣기: 판정은 한 번에 하나씩, 들어온 순서대로', async () => {
  let inFlight = 0
  let most = 0
  const { session, seen } = listen(async () => {
    inFlight++
    most = Math.max(most, inFlight)
    await new Promise((done) => setTimeout(done, 2))
    inFlight--
    return [tit]
  })
  session.push(noise(9))
  await session.finish()
  assert.equal(most, 1)
  assert.equal(seen.updates, 5)
  assert.deepEqual(seen.heard[0].spans, [[0, 9]])
})

test('듣기: 버리면 돌고 있던 판정의 답도 넣지 않고, 그 뒤의 소리도 받지 않는다', async () => {
  let release: () => void = () => undefined
  const { session, seen } = listen(() => new Promise((done) => { release = () => done([tit]) }))
  session.push(noise(3))
  session.cancel()
  release()
  await new Promise((done) => setTimeout(done, 5))
  session.push(noise(6))
  await session.finish()
  assert.equal(seen.updates, 0)
  assert.deepEqual(seen.errors, [])
})

test('듣기: 판정이 실패하면 이유를 한 번만 알리고 멈춘다', async () => {
  let calls = 0
  const { session, seen } = listen(async () => { calls++; throw new Error('모델이 멈췄습니다.') })
  session.push(noise(9))
  await session.finish()
  session.push(noise(9))
  assert.deepEqual(seen.errors, ['모델이 멈췄습니다.'])
  assert.equal(calls, 1)
  assert.equal(seen.updates, 0)
})

test('듣기: 실시간은 판정이 밀리면 오래된 창을 버린다, 파일은 하나도 버리지 않는다', async () => {
  const slow = async () => { await new Promise((done) => setTimeout(done, 1)); return [tit] }
  const live = listen(slow, true)
  live.session.push(noise(30))
  await live.session.finish()
  assert.ok(live.session.dropped() > 0)
  assert.equal(live.seen.updates + live.session.dropped(), 19, '30초 = 창 19개')
  const file = listen(slow, false)
  file.session.push(noise(30))
  await file.session.finish()
  assert.equal(file.session.dropped(), 0)
  assert.equal(file.seen.updates, 19)
})

test('듣기: idle은 넣은 창의 판정이 다 끝나야 돌아온다', async () => {
  const { session, seen } = listen(async () => { await new Promise((done) => setTimeout(done, 1)); return [tit] })
  await session.idle()
  session.push(noise(6))
  assert.equal(seen.updates, 0)
  await session.idle()
  assert.equal(seen.updates, 3)
})
