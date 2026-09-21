import test from 'node:test'
import assert from 'node:assert/strict'
import { formatFeature, formatPlace } from '../api/place.ts'

test('formatPlace: 큰 단위 → 작은 단위 순으로 잇고, 없는 단계는 건너뛴다', () => {
  assert.equal(formatPlace({ state: '경기도', city: '파주시', town: '문산읍' }), '경기도 파주시 문산읍')
  assert.equal(formatPlace({ city: '서울특별시', borough: '성동구', suburb: '성수동' }), '서울특별시 성동구 성수동')
})

test('formatPlace: 같은 이름이 두 단계에 겹치면 한 번만', () => {
  assert.equal(formatPlace({ city: '세종', county: '세종', town: '조치원읍' }), '세종 조치원읍')
})

test('formatPlace·formatFeature: 주소가 없으면 빈 문자열', () => {
  assert.equal(formatPlace(null), '')
  assert.equal(formatFeature(undefined), '')
})

test('formatFeature: 물·자연·공원 이름을 고른다', () => {
  assert.equal(formatFeature({ water: '주남저수지', leisure: '공원' }), '주남저수지')
})
