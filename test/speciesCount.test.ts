import test from 'node:test'
import assert from 'node:assert/strict'
import { countSpecies } from '../src/features/dex/speciesCount.ts'
import type { Sighting } from '../src/types.ts'

/** 종 세기에 쓰는 칸만 든 가짜 기록 */
const rec = (speciesKo: string) => ({ speciesKo }) as Sighting

test('countSpecies: 같은 종의 기록 여럿은 한 종', () => {
  assert.equal(countSpecies([rec('딱새'), rec('딱새'), rec('물총새')]), 2)
})

test('countSpecies: 이름 미정 기록은 세지 않는다, 기록이 없으면 0', () => {
  assert.equal(countSpecies([rec(''), rec('참새'), rec('')]), 1)
  assert.equal(countSpecies([rec(''), rec('')]), 0)
  assert.equal(countSpecies([]), 0)
})
