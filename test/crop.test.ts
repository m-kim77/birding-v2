import test from 'node:test'
import assert from 'node:assert/strict'
import { CROP_MAX_EDGE, cropRect, dataUrlToBlob, fitLongEdge, normalizeRect } from '../src/lib/crop.ts'

// node --test 에는 canvas 도 createImageBitmap 도 없다. 그래서 cropFromFile 자체는 여기서
// 못 돌린다 — 대신 좌표를 실제로 틀리게 만드는 순수 계산부만 정면으로 검사한다.

const SRC = { width: 6240, height: 4160 }
const NO_PAD = 0

test('정규화 상자가 원본 픽셀로 정확히 환산된다', () => {
  const rect = cropRect({ x1: 0.25, y1: 0.5, x2: 0.75, y2: 1 }, SRC, NO_PAD)

  assert.deepEqual(rect, { x: 1560, y: 2080, width: 3120, height: 2080 })
})

test('실측 상자가 기준 픽셀과 맞는다', () => {
  // detection_test 에서 잰 값: yolox_nano 가 6240x4160 사진에서 낸 최고 점수 상자
  const rect = cropRect({ x1: 0.33908, y1: 0.31645, x2: 0.51588, y2: 0.47729 }, SRC, NO_PAD)

  assert.deepEqual(rect, { x: 2116, y: 1316, width: 1103, height: 670 })
})

test('여백은 상자 자신의 크기에 비례하고, 프레임을 넘으면 그 자리에서 잘린다', () => {
  const middle = cropRect({ x1: 0.4, y1: 0.4, x2: 0.6, y2: 0.6 }, { width: 1000, height: 1000 }, 0.5)
  // 폭 200 의 50% = 100 씩 양쪽으로
  assert.deepEqual(middle, { x: 300, y: 300, width: 400, height: 400 })

  // 왼쪽 위 모서리에 붙은 상자: 밖으로 나갈 만큼은 잘리고, 반대쪽으로 밀지 않는다.
  // 밀어버리면 상자가 피사체를 벗어나 정작 새가 크롭 밖으로 나간다.
  const corner = cropRect({ x1: 0, y1: 0, x2: 0.1, y2: 0.1 }, { width: 1000, height: 1000 }, 0.5)
  assert.deepEqual(corner, { x: 0, y: 0, width: 150, height: 150 })

  const far = cropRect({ x1: 0.9, y1: 0.9, x2: 1, y2: 1 }, { width: 1000, height: 1000 }, 0.5)
  assert.deepEqual(far, { x: 850, y: 850, width: 150, height: 150 })
})

test('뒤집힌 상자도 정렬해서 받는다', () => {
  const flipped = cropRect({ x1: 0.75, y1: 1, x2: 0.25, y2: 0.5 }, SRC, NO_PAD)

  assert.deepEqual(flipped, cropRect({ x1: 0.25, y1: 0.5, x2: 0.75, y2: 1 }, SRC, NO_PAD))
})

test('넓이가 0으로 무너진 상자도 최소 1x1은 돌려준다', () => {
  const zero = cropRect({ x1: 0.5, y1: 0.5, x2: 0.5, y2: 0.5 }, { width: 100, height: 100 }, NO_PAD)
  assert.equal(zero.width, 1)
  assert.equal(zero.height, 1)

  // 오른쪽 끝에 붙은 0폭 상자는 1px 을 확보하되 프레임 밖으로 나가지 않아야 한다
  const edge = cropRect({ x1: 1, y1: 1, x2: 1, y2: 1 }, { width: 100, height: 100 }, NO_PAD)
  assert.equal(edge.x + edge.width, 100)
  assert.equal(edge.y + edge.height, 100)
})

test('프레임 크기나 좌표가 올바르지 않으면 던진다 (조용히 틀린 사각형을 내지 않는다)', () => {
  assert.throws(() => cropRect({ x1: 0, y1: 0, x2: 1, y2: 1 }, { width: 0, height: 100 }))
  assert.throws(() => cropRect({ x1: 0, y1: 0, x2: 1, y2: 1 }, { width: Number.NaN, height: 100 }))
  assert.throws(() => cropRect({ x1: Number.NaN, y1: 0, x2: 1, y2: 1 }, SRC))
})

test('긴 변 상한은 줄이기만 하고 키우지 않는다', () => {
  const big = fitLongEdge(4000, 3000, CROP_MAX_EDGE)
  assert.equal(big.width, CROP_MAX_EDGE)
  assert.equal(big.height, 1536) // 3000 * 2048/4000
  // 비율이 유지되는지 (반올림 1px 안)
  assert.ok(Math.abs(big.width / big.height - 4000 / 3000) < 0.01)

  const small = fitLongEdge(300, 200, CROP_MAX_EDGE)
  assert.deepEqual(small, { width: 300, height: 200 }, '작은 크롭을 확대하면 없던 정보가 생긴 것처럼 보인다')

  const tall = fitLongEdge(100, 5000, 1000)
  assert.equal(tall.height, 1000)
  assert.ok(tall.width >= 1, '납작해져도 최소 1px 은 남아야 한다')
})

test('픽셀 사각형이 정규화 좌표로 되돌아간다 (1픽셀 안에서 왕복한다)', () => {
  const box = { x1: 0.33908, y1: 0.31645, x2: 0.51588, y2: 0.47729 }
  const rect = cropRect(box, SRC, NO_PAD)
  const back = normalizeRect(rect, SRC)

  for (const key of ['x1', 'y1', 'x2', 'y2'] as const) {
    const axis = key.startsWith('x') ? SRC.width : SRC.height
    assert.ok(
      Math.abs(back[key] - box[key]) * axis <= 1,
      `${key} 왕복 오차가 1픽셀을 넘었다: ${back[key]} vs ${box[key]}`,
    )
  }
})

test('저장하는 정규화 좌표에는 여백이 반영돼 있다', () => {
  // crop_box 는 '실제로 잘라낸 자리'여야 한다. 여백을 뺀 원래 상자를 저장하면
  // 나중에 그 좌표로 다시 자를 때 지금 저장된 크롭과 다른 그림이 나온다.
  const box = { x1: 0.4, y1: 0.4, x2: 0.6, y2: 0.6 }
  const padded = normalizeRect(cropRect(box, SRC, 0.15), SRC)

  assert.ok(padded.x1 < box.x1 && padded.x2 > box.x2)
  assert.ok(padded.y1 < box.y1 && padded.y2 > box.y2)
})

// ---- dataUrlToBlob: 크롭을 판정 사이드카에 올리기 직전 단계 ----

/** 1x1 JPEG. 실제로 디코드하지 않으므로 형식 검사에 필요한 최소치다 */
const TINY_JPEG =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsL' +
  'DBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAAB' +
  'AAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q=='

test('data URL 이 정확한 바이트 수와 타입의 Blob 이 된다', async () => {
  const blob = dataUrlToBlob(TINY_JPEG)
  assert.equal(blob.type, 'image/jpeg')
  // 서버가 저장할 바이트와 정확히 같아야 한다 — 길이가 어긋나면 사이드카 Content-Length 도 어긋난다
  assert.equal(blob.size, Buffer.from(TINY_JPEG.split(',')[1], 'base64').length)
})

test("toDataURL 실패값 'data:,' 를 거부한다", () => {
  // canvas.toDataURL 은 실패해도 던지지 않고 이 값을 돌려준다. 통과시키면 0바이트가
  // 사이드카로 올라가 원인을 알 수 없는 413 이 된다.
  assert.throws(() => dataUrlToBlob('data:,'), /data URL/)
})

test('data URL 이 아닌 문자열을 거부한다', () => {
  assert.throws(() => dataUrlToBlob('not-a-data-url'), /data URL/)
  assert.throws(() => dataUrlToBlob('data:text/plain;base64,aGk='), /data URL/)
})

test('base64 가 깨졌으면 짧은 Blob 을 만들지 않고 던진다', () => {
  assert.throws(() => dataUrlToBlob('data:image/jpeg;base64,!!!not-base64!!!'), /base64/)
})
