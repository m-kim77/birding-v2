import test from 'node:test'
import assert from 'node:assert/strict'
import { ALL_VIEW, keepValid, pickable, type JournalView, type ViewOption } from '../src/features/records/journalView.ts'

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
