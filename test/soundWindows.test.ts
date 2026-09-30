import test from 'node:test'
import assert from 'node:assert/strict'
import { loudness, makeCutter, meterLevel, MODEL_RATE, MODEL_SAMPLES, toModelRate } from '../src/features/sound/windows.ts'

/** 셈하기 쉬운 표본율 — 1초에 10개, 창 30개, 간격 15개 */
const RATE = 10
/** 0, 1, 2 … 로 채운 소리 (어느 자리의 소리인지 값으로 알 수 있게) */
const ramp = (length: number, from = 0) => Float32Array.from({ length }, (_, i) => from + i)

test('makeCutter: 3초가 차야 창이 나오고, 창은 1.5초씩 옮겨 간다', () => {
  const cutter = makeCutter(RATE)
  assert.deepEqual(cutter.push(ramp(29)), [])
  const first = cutter.push(ramp(1, 29))
  assert.equal(first.length, 1)
  assert.equal(first[0].start, 0)
  assert.deepEqual([...first[0].samples], [...ramp(30)])
  const second = cutter.push(ramp(15, 30))
  assert.equal(second[0].start, 1.5)
  assert.deepEqual([...second[0].samples], [...ramp(30, 15)])
  assert.equal(cutter.seconds(), 4.5)
})

test('makeCutter: 큰 조각 하나에서 창 여러 개가 나온다', () => {
  const windows = makeCutter(RATE).push(ramp(74))
  assert.deepEqual(windows.map((w) => w.start), [0, 1.5, 3])
  assert.deepEqual(windows.map((w) => w.samples[0]), [0, 15, 30])
})

test('makeCutter: 돌려준 창은 다음 조각이 와도 바뀌지 않는다', () => {
  const cutter = makeCutter(RATE)
  const [first] = cutter.push(ramp(30))
  cutter.push(ramp(30, 100))
  assert.deepEqual([...first.samples], [...ramp(30)])
})

test('flush: 3초보다 짧은 소리는 뒤를 0으로 채운 창 하나가 된다', () => {
  const cutter = makeCutter(RATE)
  cutter.push(ramp(19, 1))
  const last = cutter.flush()
  assert.equal(last?.start, 0)
  assert.equal(last?.samples.length, 30)
  assert.deepEqual([...last!.samples.slice(0, 19)], [...ramp(19, 1)])
  assert.ok(last!.samples.slice(19).every((v) => v === 0))
  assert.equal(cutter.flush(), null, '두 번 부르면 남은 것이 없다')
})

test('flush: 앞의 창이 덮지 못한 소리가 있으면 마지막 창을 하나 더 낸다 (4초 → 창 둘)', () => {
  const cutter = makeCutter(RATE)
  assert.equal(cutter.push(ramp(40)).length, 1)
  const last = cutter.flush()
  assert.equal(last?.start, 1.5)
  assert.deepEqual([...last!.samples.slice(0, 25)], [...ramp(25, 15)])
  assert.ok(last!.samples.slice(25).every((v) => v === 0))
})

test('flush: 앞의 창이 이미 다 덮었으면 null (3초·4.5초)', () => {
  for (const length of [30, 45]) {
    const cutter = makeCutter(RATE)
    cutter.push(ramp(length))
    assert.equal(cutter.flush(), null, `${length / RATE}초`)
  }
})

test('flush: 소리를 받은 적이 없으면 null', () => {
  assert.equal(makeCutter(RATE).flush(), null)
})

test('toModelRate: 48kHz는 값 그대로, 길이만 맞춘다', () => {
  const short = toModelRate(Float32Array.from([0.1, 0.2]), MODEL_RATE)
  assert.equal(short.length, MODEL_SAMPLES)
  assert.ok(Math.abs(short[1] - 0.2) < 1e-6)
  assert.equal(short[2], 0)
  assert.equal(toModelRate(new Float32Array(MODEL_SAMPLES + 10).fill(0.5), MODEL_RATE).length, MODEL_SAMPLES)
})

test('toModelRate: 다른 표본율의 3초 창은 144,000개가 되고 소리의 높이가 그대로다', () => {
  const rate = 44100
  const hz = 1000
  const source = Float32Array.from({ length: 3 * rate }, (_, i) => Math.sin((2 * Math.PI * hz * i) / rate))
  const out = toModelRate(source, rate)
  assert.equal(out.length, MODEL_SAMPLES)
  // 같은 시각의 값이 1kHz 사인과 맞는지 — 곧게 이은 값이라 조금 어긋난다
  for (const i of [100, 4800, 72000, 143000]) assert.ok(Math.abs(out[i] - Math.sin((2 * Math.PI * hz * i) / MODEL_RATE)) < 0.02, `${i}번째`)
})

test('toModelRate: 빈 소리·이상한 표본율은 조용한 창을 돌려준다 (던지지 않는다)', () => {
  assert.equal(loudness(toModelRate(new Float32Array(0), 44100)), 0)
  assert.equal(loudness(toModelRate(Float32Array.from([1, 1]), 0)), 0)
  assert.equal(loudness(toModelRate(Float32Array.from([1, 1]), Number.NaN)), 0)
})

test('loudness: 조용하면 0, 가득 찬 소리는 1', () => {
  assert.equal(loudness(new Float32Array(0)), 0)
  assert.equal(loudness(new Float32Array(100)), 0)
  assert.equal(loudness(new Float32Array(100).fill(-1)), 1)
})

test('meterLevel: −60dB 이하는 0, 0dB는 1, 그 사이는 데시벨에 비례', () => {
  assert.equal(meterLevel(0), 0)
  assert.equal(meterLevel(Number.NaN), 0)
  assert.equal(meterLevel(0.0001), 0)
  assert.ok(Math.abs(meterLevel(0.001)) < 1e-9)
  assert.ok(Math.abs(meterLevel(0.0316) - 0.5) < 0.01, '−30dB')
  assert.equal(meterLevel(1), 1)
  assert.equal(meterLevel(3), 1)
})
