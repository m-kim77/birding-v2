import test from 'node:test'
import assert from 'node:assert/strict'
import { daysAgoOf, fileDateOf, fileDateToday, timeOf, yearMonthOf } from '../src/ui/when.ts'

test('timeOf: 촬영지 시각의 시:분, 두 자리로 — UTC로는 전날 밤이어도', () => {
  // 서울 2026-09-22 06:48 = 2026-09-21T21:48Z
  assert.equal(timeOf({ capturedAt: '2026-09-21T21:48:00.000Z', capturedAtOffset: '+09:00' }), '06:48')
  assert.equal(timeOf({ capturedAt: '2026-09-22T00:05:59.000Z', capturedAtOffset: '+09:00' }), '09:05', '초는 버린다')
})

test("timeOf: 못 읽는 시각은 빈 글자 ('NaN:NaN'을 주지 않는다)", () => {
  assert.equal(timeOf({ capturedAt: 'not-a-date', capturedAtOffset: '+09:00' }), '')
  assert.equal(timeOf({ capturedAt: '', capturedAtOffset: null }), '')
})

test('yearMonthOf: 한국 1월 1일 00:30은 새해 — UTC로는 전해 12월 31일이다', () => {
  // 2026-01-01 00:30 KST = 2025-12-31T15:30Z
  const s = { capturedAt: '2025-12-31T15:30:00.000Z', capturedAtOffset: '+09:00' }
  assert.deepEqual(yearMonthOf(s), { year: 2026, month: 1 })
  assert.equal(s.capturedAt.slice(0, 4), '2025')
})

test('yearMonthOf: 서쪽 오프셋은 반대로 — UTC로 새해여도 촬영지에서는 아직 전해', () => {
  // 2025-12-31 20:00 (-05:00) = 2026-01-01T01:00Z
  assert.deepEqual(yearMonthOf({ capturedAt: '2026-01-01T01:00:00.000Z', capturedAtOffset: '-05:00' }), { year: 2025, month: 12 })
})

test('yearMonthOf: 못 읽는 시각은 null (NaN을 주지 않는다)', () => {
  assert.equal(yearMonthOf({ capturedAt: 'not-a-date', capturedAtOffset: '+09:00' }), null)
  assert.equal(yearMonthOf({ capturedAt: '', capturedAtOffset: null }), null)
})

test('fileDateOf: 한국 새벽 사진은 촬영지 날짜로 (UTC로 자르면 전날이 된다)', () => {
  // 2026-09-22 01:30 KST = 2026-09-21T16:30Z
  const s = { capturedAt: '2026-09-21T16:30:00.000Z', capturedAtOffset: '+09:00' }
  assert.equal(fileDateOf(s), '2026-09-22')
  assert.equal(s.capturedAt.slice(0, 10), '2026-09-21')
})

test('fileDateOf: 오프셋을 모르면 브라우저(여기서는 node) 시간대로 푼다 — 형식만 확인', () => {
  assert.match(fileDateOf({ capturedAt: '2026-09-21T16:30:00.000Z', capturedAtOffset: null }), /^\d{4}-\d{2}-\d{2}$/)
})

test('fileDateToday: 주어진 시각의 로컬 날짜', () => {
  const d = new Date(2026, 8, 22, 1, 0)
  assert.equal(fileDateToday(d), '2026-09-22')
})

test('daysAgoOf: 오늘·어제·N일 전, 빈 값은 null', () => {
  const now = new Date(2026, 8, 22, 9, 0)
  assert.equal(daysAgoOf(new Date(2026, 8, 22, 1, 0).toISOString(), now), '오늘')
  assert.equal(daysAgoOf(new Date(2026, 8, 21, 23, 59).toISOString(), now), '어제')
  assert.equal(daysAgoOf(new Date(2026, 8, 12, 12, 0).toISOString(), now), '10일 전')
  assert.equal(daysAgoOf('', now), null)
  assert.equal(daysAgoOf('garbage', now), null)
})
