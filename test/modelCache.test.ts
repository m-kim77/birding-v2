import test from 'node:test'
import assert from 'node:assert/strict'
import { partProgress, progressTotal, staleUrls } from '../src/features/detect/modelCache.ts'

test('partProgress: 모델 7.3 · wasm 2.3으로 나누면 모델을 다 받을 때 약 76%, wasm 절반이면 약 88%, 끝은 정확히 1', () => {
  const seen: number[] = []
  const [toModel, toWasm] = partProgress([7.3, 2.3], (f) => seen.push(f))
  toModel(0.5)
  toModel(1)
  toWasm(0.5)
  toWasm(1)
  assert.deepEqual(seen.map((f) => Math.round(f * 100)), [38, 76, 88, 100])
  assert.equal(seen.at(-1), 1)
})

test('partProgress: 받아 둔 모델은 곧바로 1을 알려도 막대가 뒷걸음치지 않고, 0~1 밖의 값은 잘라 쓴다', () => {
  const seen: number[] = []
  const [toModel, toWasm] = partProgress([7.3, 2.3], (f) => seen.push(f))
  toModel(1)
  toWasm(-0.5)
  toWasm(3)
  assert.ok(seen[1] >= seen[0])
  assert.equal(seen[2], 1)
})

test('partProgress: 무게의 합이 0이면 똑같이 나눈다', () => {
  const seen: number[] = []
  const [a, b] = partProgress([0, 0], (f) => seen.push(f))
  a(1)
  b(0.5)
  assert.deepEqual(seen, [0.5, 0.75])
})

test('progressTotal: 압축해 보낸 응답(content-encoding)의 content-length는 줄인 크기라 쓰지 않고 풀린 크기 짐작을 쓴다 — 쓰면 받기의 4분의 1쯤에서 막대가 끝난다', () => {
  assert.equal(progressTotal(new Headers({ 'content-encoding': 'br', 'content-length': '2300000' }), 11_000_000), 11_000_000)
  assert.equal(progressTotal(new Headers({ 'content-length': '7300000' }), 11_000_000), 7_300_000)
  // 다른 출처의 응답은 content-encoding을 읽을 수 없다 — content-length를 그대로 쓴다
  assert.equal(progressTotal(new Headers({ 'content-length': '7300000' })), 7_300_000)
  assert.equal(progressTotal(new Headers()), 0)
})

test('staleUrls: 이 모델의 파일 가운데 지금 쓰는 것만 남긴다 — 다른 모델의 파일은 건드리지 않는다', () => {
  const site = 'https://birding.example/assets/'
  const cached = [
    'https://storage.example/efficientdet_lite0.tflite',
    `${site}vision_wasm_internal-OLD.wasm`,
    `${site}vision_wasm_internal-NEW.wasm`,
    'https://other.example/birdnet.onnx',
  ]
  const isWasm = (url: string) => url.includes('/vision_wasm')
  assert.deepEqual(staleUrls(cached, isWasm, [`${site}vision_wasm_internal-NEW.wasm`]), [`${site}vision_wasm_internal-OLD.wasm`])
  assert.deepEqual(staleUrls(cached, isWasm, []), [`${site}vision_wasm_internal-OLD.wasm`, `${site}vision_wasm_internal-NEW.wasm`])
})
