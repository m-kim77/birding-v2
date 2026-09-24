import test from 'node:test'
import assert from 'node:assert/strict'
import { DRAFT_MAX_AGE_MS, isDraftFields, isDraftStale } from '../src/data/draft.ts'
import { recentTimeOf } from '../src/ui/when.ts'

const NOW = new Date('2026-09-22T12:00:00.000Z')

test('isDraftStale: 7일 안쪽은 살아 있고, 넘으면 오래됐다', () => {
  assert.equal(isDraftStale(new Date(NOW.getTime() - 3 * 86_400_000).toISOString(), NOW), false)
  assert.equal(isDraftStale(new Date(NOW.getTime() - DRAFT_MAX_AGE_MS).toISOString(), NOW), false)
  assert.equal(isDraftStale(new Date(NOW.getTime() - DRAFT_MAX_AGE_MS - 1000).toISOString(), NOW), true)
})

test('isDraftStale: 못 읽는 시각은 오래된 것으로, 미래 시각(시계가 뒤로 감)은 살아 있는 것으로', () => {
  assert.equal(isDraftStale('', NOW), true)
  assert.equal(isDraftStale('어제', NOW), true)
  assert.equal(isDraftStale(new Date(NOW.getTime() + 86_400_000).toISOString(), NOW), false)
})

const GOOD = {
  v: 1, crop: { box: { x1: 0.1, y1: 0.2, x2: 0.5, y2: 0.6 }, by: 'manual' }, name: '물총새', note: '', 
  place: { lat: 37.5, lng: 127, name: '한강', source: 'manual' }, verdict: null, askedBox: null, savedAt: NOW.toISOString(),
}

test('isDraftFields: 온전한 초안은 통과 (crop·verdict·askedBox가 null이어도)', () => {
  assert.equal(isDraftFields(GOOD), true)
  assert.equal(isDraftFields({ ...GOOD, crop: null, askedBox: { x1: 0, y1: 0, x2: 1, y2: 1 }, verdict: { kind: '확정' } }), true)
})

test('isDraftFields: 판이 다르거나 필수 키가 빠지거나 모양이 틀리면 거른다 — 반쪽 초안을 되살리지 않는다', () => {
  assert.equal(isDraftFields(undefined), false)
  assert.equal(isDraftFields({ ...GOOD, v: 2 }), false)
  assert.equal(isDraftFields({ ...GOOD, place: undefined }), false)
  assert.equal(isDraftFields({ ...GOOD, name: undefined }), false)
  assert.equal(isDraftFields({ ...GOOD, crop: { box: { x1: '0' } } }), false)
  assert.equal(isDraftFields({ ...GOOD, askedBox: 'yes' }), false)
  assert.equal(isDraftFields({ ...GOOD, verdict: 'ok' }), false)
})

test('recentTimeOf: 오늘·어제·N일 전 + 오전/오후 시:분 (브라우저 시간대)', () => {
  const at = new Date(NOW)
  at.setHours(15, 20, 0, 0)
  assert.equal(recentTimeOf(at.toISOString(), NOW), '오늘 오후 3:20')
  at.setDate(at.getDate() - 1); at.setHours(0, 5)
  assert.equal(recentTimeOf(at.toISOString(), NOW), '어제 오전 12:05')
  at.setDate(at.getDate() - 2); at.setHours(12, 0)
  assert.equal(recentTimeOf(at.toISOString(), NOW), '3일 전 오후 12:00')
  assert.equal(recentTimeOf('', NOW), null)
})
