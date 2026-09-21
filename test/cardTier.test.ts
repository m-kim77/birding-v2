import test from 'node:test'
import assert from 'node:assert/strict'
import { dexNoFor, shouldReveal, tierFor } from '../src/features/dex/cardTier.ts'
import type { Sighting } from '../src/types.ts'

const seen = (speciesKo: string, capturedAt: string) => ({ speciesKo, capturedAt }) as Sighting

test('처음 본 종은 3단계(첫 만남)이고 등장 연출이 나온다', () => {
  const tier = tierFor('물총새', '2026-09-22T00:00:00Z', [], [seen('딱새', '2026-01-01T00:00:00Z')])
  assert.equal(tier, 3)
  assert.equal(shouldReveal(tier), true)
})

test('올해 처음이면 2단계, 올해 이미 봤으면 1단계 — 연출은 없다', () => {
  assert.equal(tierFor('딱새', '2026-09-22T00:00:00Z', [], [seen('딱새', '2025-05-01T00:00:00Z')]), 2)
  const again = tierFor('딱새', '2026-09-22T00:00:00Z', [], [seen('딱새', '2026-05-01T00:00:00Z')])
  assert.equal(again, 1)
  assert.equal(shouldReveal(again), false)
})

test('멸종위기·길잃은새 도장이 있으면 몇 번째든 4단계', () => {
  assert.equal(tierFor('수리부엉이', '2026-09-22T00:00:00Z', ['멸종위기'], [seen('수리부엉이', '2026-01-01T00:00:00Z')]), 4)
})

test('이름 없는 기록은 비교할 종이 없으므로 1단계', () => {
  assert.equal(tierFor('', '2026-09-22T00:00:00Z', [], []), 1)
})


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
