import test from 'node:test'
import assert from 'node:assert/strict'
import { countSpecies, showsYearCount, speciesInYear, yearTally } from '../src/features/dex/speciesCount.ts'
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

/** 해를 세는 데 쓰는 칸만 든 가짜 기록. 오프셋은 늘 적는다 — null이면 실행 기기의 시간대를 타서 해가 기기마다 달라진다 */
const at = (speciesKo: string, capturedAt: string) => ({ speciesKo, capturedAt, capturedAtOffset: '+09:00' }) as Sighting

test('speciesInYear: 촬영지 시각의 해로 센다 — 한국 1월 1일 00:30(UTC로는 전해 12월 31일)은 새해', () => {
  const list = [at('딱새', '2025-12-31T15:30:00.000Z'), at('물총새', '2025-12-31T14:30:00.000Z')]
  assert.deepEqual([...speciesInYear(list, 2026)], ['딱새'])
  assert.deepEqual([...speciesInYear(list, 2025)], ['물총새'])
})

test('speciesInYear: 이름 미정·못 읽는 시각은 넣지 않고, 같은 종은 한 번', () => {
  const list = [at('', '2026-05-01T00:00:00.000Z'), at('참새', 'not-a-date'), at('박새', '2026-05-01T00:00:00.000Z'), at('박새', '2026-06-01T00:00:00.000Z')]
  assert.deepEqual([...speciesInYear(list, 2026)], ['박새'])
  assert.equal(speciesInYear([], 2026).size, 0)
})

test('yearTally: 전체 종 수·그 해의 종 수', () => {
  const list = [at('딱새', '2026-03-01T00:00:00.000Z'), at('딱새', '2025-03-01T00:00:00.000Z'), at('물총새', '2025-04-01T00:00:00.000Z')]
  assert.deepEqual(yearTally(list, 2026), { total: 2, inYear: 1 })
  assert.deepEqual(yearTally(list, 2024), { total: 2, inYear: 0 })
  assert.deepEqual(yearTally([], 2026), { total: 0, inYear: 0 })
})

test('showsYearCount: 그 해의 종이 하나 이상이고 전체보다 적을 때만 — 일지 요약과 도감 칩이 같은 답', () => {
  assert.equal(showsYearCount(1, 2), true)
  assert.equal(showsYearCount(0, 2), false)
  assert.equal(showsYearCount(2, 2), false)
  assert.equal(showsYearCount(0, 0), false)
})

test('showsYearCount: 작년에 본 종을 올해 모두 다시 봤으면 보이지 않는다 — 다른 해의 기록이 있어도 종으로는 같은 말', () => {
  const list = [at('박새', '2025-05-01T00:00:00.000Z'), at('박새', '2026-03-01T00:00:00.000Z')]
  const t = yearTally(list, 2026)
  assert.deepEqual(t, { total: 1, inYear: 1 })
  assert.equal(showsYearCount(t.inYear, t.total), false)
})

test('showsYearCount: 다른 해의 이름 미정 기록은 따지지 않는다', () => {
  const t = yearTally([at('딱새', '2026-03-01T00:00:00.000Z'), at('', '2025-03-01T00:00:00.000Z')], 2026)
  assert.equal(showsYearCount(t.inYear, t.total), false)
})
