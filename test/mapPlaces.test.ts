import test from 'node:test'
import assert from 'node:assert/strict'
import { groupPlaces, hiddenCount } from '../src/features/map/places.ts'
import type { Sighting } from '../src/types.ts'

/**
 * 좌표를 식으로 만든 가짜 지점. n이 1 늘면 약 11m씩 옮겨진다 (소수 넷째 자리).
 * 핀 격자는 소수 셋째 자리까지라 n이 0~4쯤이면 같은 격자, 10 이상 벌어지면 다른 격자다. 실제 장소의 좌표가 아니다.
 */
const at = (n: number) => ({ lat: 20 + n * 0.0001, lng: 40 + n * 0.0001 })

/** 검사에 필요한 값만 채운 기록 */
function sighting(id: string, over: Partial<Sighting> = {}): Sighting {
  return { id, place: '', capturedAt: '2026-09-01T00:00:00.000Z', sensitive: false, ...at(0), ...over } as Sighting
}

test('위치를 숨긴 기록은 핀에 없다 — 좌표가 있어도 지도에 올리지 않는다', () => {
  const places = groupPlaces([sighting('open'), sighting('secret', { sensitive: true })])
  assert.equal(places.length, 1)
  assert.deepEqual(places[0].items.map((s) => s.id), ['open'])
  // 숨긴 기록만 있는 자리는 핀 자체가 생기지 않는다
  assert.deepEqual(groupPlaces([sighting('secret', { sensitive: true, ...at(50) })]), [])
})

test('좌표가 없는 기록은 핀에 없다 (위도·경도 어느 쪽이 없어도)', () => {
  const places = groupPlaces([sighting('no-lat', { lat: null }), sighting('no-lng', { lng: null }), sighting('none', { lat: null, lng: null })])
  assert.deepEqual(places, [])
})

test('기록이 없으면 핀도 없다', () => {
  assert.deepEqual(groupPlaces([]), [])
})

test('가까운 기록은 한 핀, 격자를 넘으면 다른 핀이다 (소수 3자리 격자)', () => {
  const places = groupPlaces([sighting('a', at(1)), sighting('b', at(4)), sighting('far', at(50))])
  assert.equal(places.length, 2)
  assert.deepEqual(places.map((p) => p.items.map((s) => s.id)), [['a', 'b'], ['far']])
  assert.equal(places[0].key, '20.000,40.000')
  assert.equal(places[1].key, '20.005,40.005')
})

test('핀의 이름·자리는 가장 먼저 찍은 기록의 것이다 — 목록 순서가 아니다', () => {
  const late = sighting('late', { ...at(3), place: '늦은 곳', capturedAt: '2026-09-03T00:00:00.000Z' })
  const early = sighting('early', { ...at(1), place: '이른 곳', capturedAt: '2026-09-01T00:00:00.000Z' })
  const mid = sighting('mid', { ...at(2), place: '중간 곳', capturedAt: '2026-09-02T00:00:00.000Z' })
  const [pin] = groupPlaces([late, early, mid])
  assert.equal(pin.name, '이른 곳')
  assert.equal(pin.lat, at(1).lat)
  assert.equal(pin.lng, at(1).lng)
  assert.deepEqual(pin.items.map((s) => s.id), ['late', 'early', 'mid'], '묶음 안의 순서는 받은 순서 그대로')
})

test('기록이 늘어도 핀은 움직이지 않는다 — 나중에 찍은 기록이 더해져도 같은 자리·같은 이름', () => {
  const first = sighting('first', { ...at(1), place: '처음 곳', capturedAt: '2026-09-01T00:00:00.000Z' })
  const before = groupPlaces([first])[0]
  const after = groupPlaces([first, sighting('newer', { ...at(3), place: '나중 곳', capturedAt: '2026-09-09T00:00:00.000Z' })])[0]
  assert.equal(after.name, before.name)
  assert.equal(after.lat, before.lat)
  assert.equal(after.lng, before.lng)
})

test('같은 시각이면 id가 앞선 기록이 대표다 (목록 순서와 무관하게 늘 같은 핀)', () => {
  const a = sighting('a', { ...at(1), place: '가 곳' })
  const b = sighting('b', { ...at(2), place: '나 곳' })
  assert.equal(groupPlaces([a, b])[0].name, '가 곳')
  assert.equal(groupPlaces([b, a])[0].name, '가 곳')
})

test("대표 기록의 장소 이름이 비면 핀 이름은 '이름 없는 장소'", () => {
  assert.equal(groupPlaces([sighting('a', { place: '' })])[0].name, '이름 없는 장소')
})

test('hiddenCount: 좌표가 있는데 숨긴 기록만 센다', () => {
  const list = [
    sighting('open'),
    sighting('secret1', { sensitive: true }),
    sighting('secret2', { sensitive: true, ...at(50) }),
    // 숨겼지만 좌표가 없다 — 올릴 것이 없으니 "숨긴 기록"으로 세지 않는다
    sighting('secret-no-coords', { sensitive: true, lat: null, lng: null }),
    sighting('no-coords', { lat: null, lng: null }),
  ]
  assert.equal(hiddenCount(list), 2)
  assert.equal(hiddenCount([]), 0)
})

test('핀에 오른 기록과 숨긴 기록은 겹치지 않는다 — 좌표 있는 기록은 둘 중 하나다', () => {
  const list = [sighting('a'), sighting('b', at(50)), sighting('c', { sensitive: true }), sighting('d', { sensitive: true, ...at(50) })]
  const onMap = groupPlaces(list).reduce((n, p) => n + p.items.length, 0)
  assert.equal(onMap + hiddenCount(list), list.length)
})
