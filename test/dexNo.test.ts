import test from 'node:test'
import assert from 'node:assert/strict'
import { dexNoFor, isFirstMeet } from '../src/features/dex/dexNo.ts'
import type { Sighting } from '../src/types.ts'

const numbered = (speciesKo: string, dexNo?: number) => ({ speciesKo, dexNo, capturedAt: '2026-01-01T00:00:00Z' }) as Sighting

test('dexNoFor: 처음 본 종은 다음 번호, 이미 본 종은 그 종의 번호', () => {
  const existing = [numbered('딱새', 1), numbered('물총새', 2), numbered('딱새', 1)]
  assert.equal(dexNoFor('황조롱이', existing), 3)
  assert.equal(dexNoFor('딱새', existing), 1)
})

test('dexNoFor: 첫 기록은 1번, 이름 없는 기록은 번호가 없다', () => {
  assert.equal(dexNoFor('참새', []), 1)
  assert.equal(dexNoFor('', [numbered('딱새', 1)]), undefined)
})

test('dexNoFor: 앞 번호의 기록이 지워져도 남은 번호를 다시 쓰지 않는다', () => {
  assert.equal(dexNoFor('참새', [numbered('물총새', 5)]), 6)
})

test('isFirstMeet: 처음 보는 이름만 true, 이름이 없으면 false', () => {
  assert.equal(isFirstMeet('물총새', [numbered('딱새', 1)]), true)
  assert.equal(isFirstMeet('딱새', [numbered('딱새', 1)]), false)
  assert.equal(isFirstMeet('', []), false)
})
