import test from 'node:test'
import assert from 'node:assert/strict'
import { outingHeadText, outingsOf, SAME_OUTING_M, type Outing } from '../src/features/records/outings.ts'
import type { Sighting } from '../src/types.ts'

/*
 * 좌표는 식으로 만든 가짜다 — 바다 한가운데의 기준점(위도 10, 경도 20)에서 정북으로 m미터 옮긴 점.
 * 같은 경도 위에서는 하버사인 거리가 R·Δ위도(라디안) 그대로라, 1도 ≈ 111,195m로 옮기면 거리가 m과 거의 같다.
 * 장소 이름은 지어낸 것이다. 시각은 서울 오프셋('+09:00')을 늘 적는다 — null이면 실행 기기의 시간대를 타서 날짜가 기기마다 달라진다.
 */
const BASE = { lat: 10, lng: 20 }
const M_PER_DEG = 111_195
const north = (m: number) => ({ lat: BASE.lat + m / M_PER_DEG, lng: BASE.lng })
const nowhere = { lat: null, lng: null }

/** 묶기에 쓰는 칸만 든 가짜 기록. 기본은 위치 없음·이름 미정·장소 이름 없음 */
const rec = (id: string, capturedAt: string, fields: Partial<Sighting> = {}) =>
  ({ id, speciesKo: '', latin: '', place: '', note: '', capturedAt, capturedAtOffset: '+09:00', ...nowhere, ...fields }) as Sighting

/** 묶음마다 기록 id들 — 답을 한눈에 견주려고 */
const shape = (outings: Outing[]) => outings.map((o) => o.items.map((s) => s.id))

test('같은 날 가까운 셋은 한 묶음 — 종은 겹치지 않게 처음 찍힌 순, 이름 미정은 종에 들지 않는다', () => {
  // 서울 2026-09-22 06:40 · 07:10 · 09:10 (UTC로는 21일 21:40 · 22:10, 22일 00:10)
  const list = [
    rec('c', '2026-09-22T00:10:00.000Z', { ...north(900), speciesKo: '박새' }),
    rec('a', '2026-09-21T21:40:00.000Z', { ...north(0), speciesKo: '박새', place: '가상 습지' }),
    rec('b', '2026-09-21T22:10:00.000Z', { ...north(400) }),
    rec('d', '2026-09-21T23:00:00.000Z', { ...north(600), speciesKo: '쇠오리' }),
  ]
  const outings = outingsOf(list)
  assert.deepEqual(shape(outings), [['a', 'b', 'd', 'c']])
  assert.deepEqual(outings[0].species, ['박새', '쇠오리'])
  assert.equal(outings[0].key, 'a', 'key는 가장 이른 기록의 id')
  assert.equal(outings[0].date, '2026-09-22', '촬영지 날짜')
  assert.equal(outings[0].place, '가상 습지')
})

test('자정에서 자른다 — 서울 23:30과 다음 날 00:30은 둘 (UTC로 자르면 같은 날이 된다)', () => {
  // 서울 22일 23:30 = 22일 14:30Z, 서울 23일 00:30 = 22일 15:30Z
  const list = [rec('night', '2026-09-22T14:30:00.000Z', north(0)), rec('after', '2026-09-22T15:30:00.000Z', north(10))]
  const outings = outingsOf(list)
  assert.deepEqual(shape(outings), [['night'], ['after']])
  assert.deepEqual(outings.map((o) => o.date), ['2026-09-22', '2026-09-23'])
})

test(`같은 날 ${SAME_OUTING_M}m를 넘게 떨어진 두 기록은 둘, 문턱 안이면 하나`, () => {
  const far = [rec('here', '2026-09-22T00:00:00.000Z', north(0)), rec('there', '2026-09-22T01:00:00.000Z', north(SAME_OUTING_M + 100))]
  assert.deepEqual(shape(outingsOf(far)), [['here'], ['there']])
  const near = [rec('here', '2026-09-22T00:00:00.000Z', north(0)), rec('there', '2026-09-22T01:00:00.000Z', north(SAME_OUTING_M - 100))]
  assert.deepEqual(shape(outingsOf(near)), [['here', 'there']])
})

test('반경이 아니라 연달아 찍은 두 기록의 거리 — 걸으며 이어 찍으면 처음과 끝이 멀어도 한 묶음', () => {
  const walk = [0, 2500, 5000, 7500].map((m, i) => rec(`w${i}`, `2026-09-22T0${i}:00:00.000Z`, north(m)))
  assert.deepEqual(shape(outingsOf(walk)), [['w0', 'w1', 'w2', 'w3']])
})

test('다른 곳으로 옮겼다가 돌아오면 셋 — 앞의 탐조에 다시 붙이지 않는다', () => {
  const list = [
    rec('a1', '2026-09-22T00:00:00.000Z', north(0)),
    rec('b1', '2026-09-22T02:00:00.000Z', north(20_000)),
    rec('a2', '2026-09-22T04:00:00.000Z', north(100)),
  ]
  assert.deepEqual(shape(outingsOf(list)), [['a1'], ['b1'], ['a2']])
})

test('위치 없는 기록은 같은 날의 지금 묶음에 붙고, 그 기록을 사이에 두고 멀어지면 먼 기록에서 나뉜다', () => {
  const list = [
    rec('pin', '2026-09-22T00:00:00.000Z', north(0)),
    rec('nopin', '2026-09-22T00:30:00.000Z'),
    rec('far', '2026-09-22T01:00:00.000Z', north(10_000)),
    rec('nopin2', '2026-09-22T01:30:00.000Z'),
  ]
  assert.deepEqual(shape(outingsOf(list)), [['pin', 'nopin'], ['far', 'nopin2']])
})

test('위치 없는 기록만 있는 날은 한 묶음, 첫 기록에 위치가 없어도 뒤의 좌표끼리 견준다', () => {
  const blind = [rec('x', '2026-09-22T00:00:00.000Z'), rec('y', '2026-09-22T03:00:00.000Z'), rec('z', '2026-09-22T06:00:00.000Z')]
  assert.deepEqual(shape(outingsOf(blind)), [['x', 'y', 'z']])
  const late = [
    rec('x', '2026-09-22T00:00:00.000Z'),
    rec('p', '2026-09-22T01:00:00.000Z', north(0)),
    rec('q', '2026-09-22T02:00:00.000Z', north(SAME_OUTING_M + 500)),
  ]
  assert.deepEqual(shape(outingsOf(late)), [['x', 'p'], ['q']])
})

test('입력 순서를 뒤집거나 섞어도 같은 답 — 같은 순간은 id 글자 순', () => {
  const list = [
    rec('m', '2026-09-22T00:00:00.000Z', north(0)),
    rec('k', '2026-09-22T00:00:00.000Z', north(SAME_OUTING_M + 200)),
    rec('z', '2026-09-22T01:00:00.000Z', north(SAME_OUTING_M + 300)),
    rec('a', '2026-09-21T00:00:00.000Z', north(0)),
    rec('b', '2026-09-22T02:00:00.000Z'),
  ]
  const expected = [['a'], ['k'], ['m'], ['z', 'b']]
  assert.deepEqual(shape(outingsOf(list)), expected, 'k와 m은 같은 순간 — k가 먼저, 그다음 m이 멀어서 나뉜다')
  assert.deepEqual(shape(outingsOf([...list].reverse())), expected)
  assert.deepEqual(shape(outingsOf([list[2], list[0], list[4], list[1], list[3]])), expected)
})

test('장소는 이름이 있는 가장 이른 기록의 것(앞뒤 빈칸 뺌), 다 비면 빈 글자', () => {
  const named = [
    rec('a', '2026-09-22T00:00:00.000Z', { place: '  ' }),
    rec('b', '2026-09-22T01:00:00.000Z', { place: ' 연습 공원 ' }),
    rec('c', '2026-09-22T02:00:00.000Z', { place: '가상 습지' }),
  ]
  assert.equal(outingsOf(named)[0].place, '연습 공원')
  assert.equal(outingsOf([rec('a', '2026-09-22T00:00:00.000Z'), rec('b', '2026-09-22T01:00:00.000Z')])[0].place, '')
})

test('못 읽는 시각이 섞여도 던지지 않는다 — 그 기록은 한 건씩 따로(날짜 없음) 맨 뒤, 같은 날의 줄은 끊지 않는다', () => {
  const list = [
    rec('ok1', '2026-09-22T00:00:00.000Z', north(0)),
    rec('bad2', 'not-a-date', north(50_000)),
    rec('bad1', ''),
    rec('ok2', '2026-09-22T01:00:00.000Z', north(100)),
  ]
  const outings = outingsOf(list)
  assert.deepEqual(shape(outings), [['ok1', 'ok2'], ['bad1'], ['bad2']])
  assert.deepEqual(outings.map((o) => o.date), ['2026-09-22', '', ''])
})

test('칸이 빠진 옛 백업의 기록(좌표·장소·이름 없음)에서도 죽지 않는다', () => {
  const old = { id: 'old', capturedAt: '2026-01-01T00:00:00.000Z', capturedAtOffset: '+09:00' } as Sighting
  const outings = outingsOf([old, rec('new', '2026-01-01T01:00:00.000Z', north(0))])
  assert.deepEqual(shape(outings), [['old', 'new']])
  assert.equal(outings[0].place, '')
  assert.deepEqual(outings[0].species, [])
})

test('입력 배열을 바꾸지 않는다, 빈 입력은 빈 배열', () => {
  const list = [rec('late', '2026-09-22T01:00:00.000Z'), rec('early', '2026-09-22T00:00:00.000Z')]
  outingsOf(list)
  assert.deepEqual(list.map((s) => s.id), ['late', 'early'])
  assert.deepEqual(outingsOf([]), [])
})

test('outingHeadText: 날짜·장소 / 첫~마지막 시각·종 수·기록 수 / 종 이름들', () => {
  // 서울 2026-09-22 06:40 · 07:10 · 09:10
  const [o] = outingsOf([
    rec('a', '2026-09-21T21:40:00.000Z', { speciesKo: '박새', place: '가상 습지' }),
    rec('b', '2026-09-21T22:10:00.000Z', { speciesKo: '쇠오리' }),
    rec('c', '2026-09-22T00:10:00.000Z', { speciesKo: '박새' }),
  ])
  assert.deepEqual(outingHeadText(o), { title: '9월 22일 · 가상 습지', facts: '06:40~09:10 · 2종 · 기록 3건', names: '박새 · 쇠오리' })
})

test('outingHeadText: 장소 이름이 없으면 날짜만, 같은 분이면 시각 하나, 이름 붙은 종이 없으면 종 수와 이름 줄을 뺀다', () => {
  const [o] = outingsOf([rec('a', '2026-09-21T21:40:05.000Z'), rec('b', '2026-09-21T21:40:50.000Z')])
  assert.deepEqual(outingHeadText(o), { title: '9월 22일', facts: '06:40 · 기록 2건', names: '' })
})

test("outingHeadText: 시각을 못 읽는 한 건짜리에 불러도 'NaN'을 적지 않는다", () => {
  const [o] = outingsOf([rec('bad', 'not-a-date', { place: '연습 공원' })])
  assert.deepEqual(outingHeadText(o), { title: '연습 공원', facts: '기록 1건', names: '' })
})
