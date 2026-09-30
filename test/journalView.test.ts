import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ALL_VIEW, filterJournal, inPeriod, inPlace, isNarrowed, keepValid, periodKey, periodOptions, pickable, placeOptions,
  type JournalView, type ViewOption,
} from '../src/features/records/journalView.ts'
import type { Sighting } from '../src/types.ts'

/** 선택지 — 값만 쓰므로 글은 값 그대로. 장소 이름은 지어낸 것이다 */
const opts = (...values: string[]): ViewOption[] => values.map((value) => ({ value, label: value }))

const narrowed: JournalView = { query: '박새', onlyUnnamed: true, period: '2026-09', place: '가상 습지' }
const choices = { unnamed: 2, periods: opts('2026-09', '2026-08'), places: opts('가상 습지', '연습 공원') }

test('keepValid: 고른 것이 다 살아 있으면 같은 객체를 돌려준다', () => {
  assert.equal(keepValid(narrowed, choices), narrowed)
  assert.equal(keepValid(ALL_VIEW, { unnamed: 0, periods: [], places: [] }), ALL_VIEW)
})

test('keepValid: 이름 미정 기록이 0건이 되면 칩을 끈다 — 마지막 이름 미정 기록에 이름을 붙이고 돌아온 경우', () => {
  const next = keepValid(narrowed, { ...choices, unnamed: 0 })
  assert.equal(next.onlyUnnamed, false)
  assert.deepEqual({ ...next, onlyUnnamed: true }, narrowed, '나머지는 그대로')
})

test('keepValid: 선택지에서 사라진 기간·장소는 전체로 — 고른 장소의 마지막 기록을 지운 경우', () => {
  const next = keepValid(narrowed, { ...choices, periods: opts('2026-08', '2026-07'), places: opts('연습 공원', '') })
  assert.equal(next.period, '')
  assert.equal(next.place, null)
  assert.equal(next.query, '박새', '검색어는 검색 칸에 보이므로 그대로 둔다')
  assert.equal(next.onlyUnnamed, true)
})

test('keepValid: 고르개가 안 보이면(선택지가 하나뿐) 고른 것도 푼다 — 보이지 않는 고르개가 목록을 거르면 풀 길이 없다', () => {
  const next = keepValid(narrowed, { ...choices, periods: opts('2026-09'), places: opts('가상 습지') })
  assert.equal(next.period, '')
  assert.equal(next.place, null)
})

test("keepValid: '장소 이름 없음'('')도 고를 수 있는 값이다 — null(모든 장소)과 헷갈리지 않는다", () => {
  const noName = { ...ALL_VIEW, place: '' }
  assert.equal(keepValid(noName, { ...choices, places: opts('가상 습지', '') }), noName)
  assert.equal(keepValid(noName, choices).place, null)
})

test('pickable: 선택지가 둘 이상이고 그 안에 있을 때만', () => {
  assert.equal(pickable(opts('2026', '2026-09'), '2026'), true)
  assert.equal(pickable(opts('2026', '2026-09'), '2025'), false)
  assert.equal(pickable(opts('2026-09'), '2026-09'), false)
  assert.equal(pickable([], ''), false)
})

/**
 * 거르기에 쓰는 칸만 든 가짜 기록. 오프셋은 늘 적는다 — null이면 실행 기기의 시간대를 타서 해·달이 기기마다 달라진다.
 * 장소 이름은 지어낸 것이다.
 */
const rec = (id: string, capturedAt: string, fields: Partial<Sighting> = {}) =>
  ({ id, speciesKo: '', latin: '', place: '', note: '', capturedAt, capturedAtOffset: '+09:00', ...fields }) as Sighting

const ids = (list: Sighting[]) => list.map((s) => s.id)
const labels = (list: ViewOption[]) => list.map((o) => o.label)

test('기간: 한국 1월 1일 00:30은 새해로 센다 — capturedAt(UTC)은 전해 12월 31일', () => {
  const newYear = rec('a', '2025-12-31T15:30:00.000Z')
  assert.equal(periodKey(newYear), '2026-01')
  assert.equal(inPeriod(newYear, '2026'), true)
  assert.equal(inPeriod(newYear, '2026-01'), true)
  assert.equal(inPeriod(newYear, '2025'), false)
  assert.equal(inPeriod(newYear, '2025-12'), false)
  assert.equal(inPeriod(newYear, ''), true)
})

test("기간: 시각을 못 읽는 기록은 '전체 기간'에서만 보이고 선택지를 만들지 않는다", () => {
  const bad = rec('bad', 'not-a-date')
  assert.equal(periodKey(bad), null)
  assert.equal(inPeriod(bad, ''), true)
  assert.equal(inPeriod(bad, '2026'), false)
  assert.deepEqual(periodOptions([bad]), [])
  assert.deepEqual(labels(periodOptions([bad, rec('ok', '2026-09-01T00:00:00.000Z')])), ['2026년 9월 · 1건'])
})

test('periodOptions: 한 해뿐이면 달만, 기록이 있는 달만 최신부터 건수와 함께', () => {
  const list = [
    rec('a', '2026-07-10T00:00:00.000Z'),
    rec('b', '2026-09-02T00:00:00.000Z'),
    rec('c', '2026-09-20T00:00:00.000Z'),
  ]
  assert.deepEqual(periodOptions(list), [
    { value: '2026-09', label: '2026년 9월 · 2건' },
    { value: '2026-07', label: '2026년 7월 · 1건' },
  ])
  assert.deepEqual(periodOptions([]), [])
})

test("periodOptions: 두 해 이상이면 해마다 '전체'를 그 해의 달들 앞에", () => {
  const list = [
    rec('old', '2025-05-03T00:00:00.000Z'),
    rec('new1', '2026-09-02T00:00:00.000Z'),
    rec('new2', '2026-08-02T00:00:00.000Z'),
    rec('new3', '2026-08-20T00:00:00.000Z'),
  ]
  assert.deepEqual(periodOptions(list).map((o) => o.value), ['2026', '2026-09', '2026-08', '2025', '2025-05'])
  assert.deepEqual(labels(periodOptions(list)), ['2026년 전체 · 3건', '2026년 9월 · 1건', '2026년 8월 · 2건', '2025년 전체 · 1건', '2025년 5월 · 1건'])
})

test('placeOptions: 건수가 많은 순, 같으면 글자 순, 장소 이름 없음은 맨 끝, 앞뒤 빈칸은 무시', () => {
  const list = [
    rec('a', '2026-09-01T00:00:00.000Z', { place: '연습 공원' }),
    rec('b', '2026-09-02T00:00:00.000Z', { place: '' }),
    rec('c', '2026-09-03T00:00:00.000Z', { place: ' 가상 습지 ' }),
    rec('d', '2026-09-04T00:00:00.000Z', { place: '가상 습지' }),
    rec('e', '2026-09-05T00:00:00.000Z', { place: '   ' }),
    rec('f', '2026-09-06T00:00:00.000Z', { place: '가나 숲길' }),
    rec('g', '2026-09-07T00:00:00.000Z', { place: '가나 숲길' }),
    rec('h', '2026-09-08T00:00:00.000Z', { place: '가나 숲길' }),
  ]
  assert.deepEqual(placeOptions(list), [
    { value: '가나 숲길', label: '가나 숲길 · 3건' },
    { value: '가상 습지', label: '가상 습지 · 2건' },
    { value: '연습 공원', label: '연습 공원 · 1건' },
    { value: '', label: '장소 이름 없음 · 2건' },
  ])
  assert.deepEqual(placeOptions([]), [])
})

test('placeOptions: 같은 건수의 장소는 글자 순 — 입력 순서와 상관없이 같은 답', () => {
  const a = rec('a', '2026-09-01T00:00:00.000Z', { place: '다 연못' })
  const b = rec('b', '2026-09-01T00:00:00.000Z', { place: '가 연못' })
  assert.deepEqual(placeOptions([a, b]).map((o) => o.value), ['가 연못', '다 연못'])
  assert.deepEqual(placeOptions([b, a]).map((o) => o.value), ['가 연못', '다 연못'])
})

test('inPlace: null은 전부, 빈 이름은 장소 이름이 없는 기록만, 앞뒤 빈칸은 무시', () => {
  assert.equal(inPlace(rec('a', '2026-09-01T00:00:00.000Z', { place: ' 가상 습지' }), '가상 습지'), true)
  assert.equal(inPlace(rec('a', '2026-09-01T00:00:00.000Z', { place: '가상 습지' }), ''), false)
  assert.equal(inPlace(rec('a', '2026-09-01T00:00:00.000Z', { place: '  ' }), ''), true)
  assert.equal(inPlace(rec('a', '2026-09-01T00:00:00.000Z', { place: '가상 습지' }), null), true)
})

test('옛 백업처럼 place·note가 없는 기록에서도 죽지 않는다', () => {
  const old = { id: 'old', capturedAt: '2026-01-01T00:00:00.000Z', capturedAtOffset: '+09:00', speciesKo: '참새' } as Sighting
  assert.deepEqual(placeOptions([old]), [{ value: '', label: '장소 이름 없음 · 1건' }])
  assert.equal(inPlace(old, ''), true)
  assert.deepEqual(ids(filterJournal([old], { query: '참새', onlyUnnamed: false, period: '2026-01', place: '' })), ['old'])
})

test('filterJournal: 검색어·이름 미정 칩·기간·장소를 함께 걸고, 입력 순서는 그대로', () => {
  const list = [
    rec('sep-wet', '2026-09-03T00:00:00.000Z', { speciesKo: '쇠백로', place: '가상 습지' }),
    rec('sep-wet-unnamed', '2026-09-02T00:00:00.000Z', { place: '가상 습지' }),
    rec('sep-park', '2026-09-01T00:00:00.000Z', { speciesKo: '쇠백로', place: '연습 공원' }),
    rec('aug-wet', '2026-08-20T00:00:00.000Z', { speciesKo: '쇠백로', place: '가상 습지' }),
  ]
  assert.deepEqual(ids(filterJournal(list, ALL_VIEW)), ['sep-wet', 'sep-wet-unnamed', 'sep-park', 'aug-wet'])
  assert.deepEqual(ids(filterJournal(list, { ...ALL_VIEW, period: '2026-09', place: '가상 습지' })), ['sep-wet', 'sep-wet-unnamed'])
  assert.deepEqual(ids(filterJournal(list, { ...ALL_VIEW, period: '2026', query: '쇠백로' })), ['sep-wet', 'sep-park', 'aug-wet'])
  assert.deepEqual(ids(filterJournal(list, { ...ALL_VIEW, place: '가상 습지', onlyUnnamed: true })), ['sep-wet-unnamed'])
  assert.deepEqual(filterJournal(list, { ...ALL_VIEW, period: '2025' }), [])
})

test('isNarrowed: 기간이나 장소를 골랐을 때만 — 검색어·이름 미정 칩은 넣지 않는다', () => {
  assert.equal(isNarrowed(ALL_VIEW), false)
  assert.equal(isNarrowed({ ...ALL_VIEW, query: '박새', onlyUnnamed: true }), false)
  assert.equal(isNarrowed({ ...ALL_VIEW, period: '2026' }), true)
  assert.equal(isNarrowed({ ...ALL_VIEW, place: '' }), true)
})
