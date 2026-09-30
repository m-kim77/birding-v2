import test from 'node:test'
import assert from 'node:assert/strict'
import { lastPlaceOf } from '../src/features/record/lastPlace.ts'
import type { Sighting } from '../src/types.ts'

/** '직전 기록 위치'에 쓰는 칸만 든 가짜 기록. 좌표는 식으로 만든 가짜 값이다 (실제 장소가 아니다) */
function rec(id: string, createdAt: string, over: Partial<Sighting> = {}): Sighting {
  return { id, createdAt, capturedAt: createdAt, lat: 20 + id.length * 0.001, lng: 40, place: `${id} 연못`, ...over } as Sighting
}

test('lastPlaceOf: 마지막으로 만든 기록의 위치 — 받은 순서와 상관없다, 출처는 사람이 고른 것으로', () => {
  const list = [rec('a', '2026-09-01T00:00:00.000Z'), rec('bb', '2026-09-03T00:00:00.000Z'), rec('ccc', '2026-09-02T00:00:00.000Z')]
  assert.deepEqual(lastPlaceOf(list), { lat: 20.002, lng: 40, name: 'bb 연못', source: 'manual' })
  assert.deepEqual(list.map((s) => s.id), ['a', 'bb', 'ccc'], '받은 배열은 그대로')
})

test('lastPlaceOf: 촬영 시각이 아니라 만든 시각으로 고른다', () => {
  const late = rec('late', '2026-09-05T00:00:00.000Z', { capturedAt: '2026-01-01T00:00:00.000Z', place: '방금 적은 곳' })
  const old = rec('old', '2026-09-01T00:00:00.000Z', { capturedAt: '2026-09-30T00:00:00.000Z', place: '옛 기록' })
  assert.equal(lastPlaceOf([old, late])?.name, '방금 적은 곳')
})

test('lastPlaceOf: 좌표가 없는 기록은 건너뛰고, 좌표 있는 기록이 없으면 null', () => {
  const noCoords = rec('none', '2026-09-09T00:00:00.000Z', { lat: null, lng: null, place: '' })
  const withCoords = rec('pin', '2026-09-01T00:00:00.000Z', { place: '가상 습지' })
  assert.equal(lastPlaceOf([noCoords, withCoords])?.name, '가상 습지')
  assert.equal(lastPlaceOf([noCoords]), null)
  assert.equal(lastPlaceOf([]), null)
})

test("lastPlaceOf: 만든 시각을 순간으로 견준다 — '+09:00'이 붙은 시각이 날짜 글자만 앞서도 '마지막'이 되지 않는다 (작업 35 fix)", () => {
  // 'plus9'는 서울 22일 01:00 = 21일 16:00 UTC로, 'utc'(21일 20:00 UTC)보다 먼저 만들었다
  const plus9 = rec('plus9', '2026-09-22T01:00:00+09:00', { place: '먼저 적은 곳' })
  const utc = rec('utc', '2026-09-21T20:00:00.000Z', { place: '나중에 적은 곳' })
  assert.equal(lastPlaceOf([plus9, utc])?.name, '나중에 적은 곳')
  assert.equal(lastPlaceOf([utc, plus9])?.name, '나중에 적은 곳')
})
