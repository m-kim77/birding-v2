import test from 'node:test'
import assert from 'node:assert/strict'
import { fromTile, iou, makeTiles, mergeBoxes } from '../src/features/detect/tiling.ts'

test('makeTiles: 전체 1장 + 격자 조각, 전부 0~1 안', () => {
  const tiles = makeTiles(3, 2, 0.2)
  assert.equal(tiles.length, 1 + 6)
  assert.deepEqual(tiles[0], { x1: 0, y1: 0, x2: 1, y2: 1 })
  for (const t of tiles) assert.ok(t.x1 >= 0 && t.y1 >= 0 && t.x2 <= 1 + 1e-9 && t.y2 <= 1 + 1e-9 && t.x2 > t.x1 && t.y2 > t.y1)
})

test('makeTiles: 마지막 조각이 오른쪽·아래 끝에 닿는다 (가장자리의 새를 놓치지 않는다)', () => {
  const tiles = makeTiles(3, 2, 0.2).slice(1)
  assert.ok(Math.abs(Math.max(...tiles.map((t) => t.x2)) - 1) < 1e-9)
  assert.ok(Math.abs(Math.max(...tiles.map((t) => t.y2)) - 1) < 1e-9)
})

test('makeTiles: 이웃 조각은 겹친다 (경계에 걸친 새가 양쪽에서 잘리지 않게)', () => {
  const [, first, second] = makeTiles(3, 2, 0.2)
  assert.ok(second.x1 < first.x2)
})

test('fromTile: 조각 안 좌표를 원본 좌표로 되돌린다', () => {
  const box = fromTile({ x1: 0.5, y1: 0.5, x2: 1, y2: 1, score: 0.9 }, { x1: 0.5, y1: 0, x2: 1, y2: 0.5 })
  assert.deepEqual(box, { score: 0.9, x1: 0.75, y1: 0.25, x2: 1, y2: 0.5 })
})

test('iou: 같으면 1, 떨어져 있으면 0', () => {
  const a = { x1: 0, y1: 0, x2: 0.5, y2: 0.5 }
  assert.equal(iou(a, a), 1)
  assert.equal(iou(a, { x1: 0.6, y1: 0.6, x2: 1, y2: 1 }), 0)
})

test('mergeBoxes: 같은 새의 겹친 상자는 점수 높은 하나만 남긴다', () => {
  const kept = mergeBoxes([
    { x1: 0.1, y1: 0.1, x2: 0.5, y2: 0.5, score: 0.6 },
    { x1: 0.12, y1: 0.1, x2: 0.5, y2: 0.52, score: 0.9 },
    { x1: 0.7, y1: 0.7, x2: 0.9, y2: 0.9, score: 0.5 },
  ])
  assert.deepEqual(kept.map((b) => b.score), [0.9, 0.5])
})

test('mergeBoxes: 조각에서 잡힌 새의 일부(큰 상자 안에 든 작은 상자)도 같은 새로 본다', () => {
  const kept = mergeBoxes([
    { x1: 0.2, y1: 0.2, x2: 0.8, y2: 0.8, score: 0.9 },
    { x1: 0.25, y1: 0.25, x2: 0.45, y2: 0.5, score: 0.7 },
  ])
  assert.equal(kept.length, 1)
})
