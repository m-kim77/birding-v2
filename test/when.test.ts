import test from 'node:test'
import assert from 'node:assert/strict'
import { daysAgoOf, fileDateOf, fileDateToday } from '../src/ui/when.ts'

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
