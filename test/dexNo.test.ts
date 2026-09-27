import test from 'node:test'
import assert from 'node:assert/strict'
import { dexNumbers, isFirstMeet } from '../src/features/dex/dexNo.ts'
import type { Sighting } from '../src/types.ts'

/** 도감 순서에 쓰는 칸만 든 기록. `namedAt`을 빼면 옛 기록처럼 createdAt을 쓴다 */
const rec = (speciesKo: string, createdAt: string, namedAt?: string, dexNo?: number) => ({ speciesKo, createdAt, namedAt, dexNo }) as Sighting

/** 번호표를 [이름, 번호] 목록으로 — 순서까지 견준다 */
const listOf = (m: Map<string, number>) => [...m]

test('dexNumbers: 종이 도감에 처음 들어온 순서대로 1부터, 같은 종의 기록 여럿은 한 번호', () => {
  const list = [rec('물총새', '2026-03-01T00:00:00Z'), rec('딱새', '2026-01-01T00:00:00Z'), rec('딱새', '2026-05-01T00:00:00Z'), rec('황조롱이', '2026-04-01T00:00:00Z')]
  assert.deepEqual(listOf(dexNumbers(list)), [['딱새', 1], ['물총새', 2], ['황조롱이', 3]])
})

test('dexNumbers: 이름 없는 기록은 세지 않는다, 기록이 없으면 빈 표', () => {
  assert.deepEqual(listOf(dexNumbers([rec('', '2026-01-01T00:00:00Z'), rec('참새', '2026-02-01T00:00:00Z')])), [['참새', 1]])
  assert.equal(dexNumbers([]).size, 0)
})

test('dexNumbers: 두 기기의 기록을 합쳐도 다른 종이 같은 번호가 되지 않는다 — 옛 방식이면 둘 다 12번이던 경우 (작업 29)', () => {
  // PC와 폰이 각자 새 종에 dexNo 12를 저장했다. 저장된 번호는 보지 않는다
  const pc = [rec('딱새', '2026-01-01T00:00:00Z', undefined, 1), rec('물총새', '2026-09-20T00:00:00Z', undefined, 12)]
  const phone = [rec('딱새', '2026-01-01T00:00:00Z', undefined, 1), rec('황조롱이', '2026-09-21T00:00:00Z', undefined, 12)]
  const merged = dexNumbers([...pc, ...phone.slice(1)])
  assert.deepEqual(listOf(merged), [['딱새', 1], ['물총새', 2], ['황조롱이', 3]])
})

test('dexNumbers: 읽는 순서가 달라도 같은 답 — 같은 시각이면 이름 글자 순', () => {
  const a = [rec('참새', '2026-01-01T00:00:00Z'), rec('까치', '2026-01-01T00:00:00Z'), rec('박새', '2025-12-31T00:00:00Z')]
  assert.deepEqual(listOf(dexNumbers(a)), listOf(dexNumbers([...a].reverse())))
  assert.deepEqual(listOf(dexNumbers(a)), [['박새', 1], ['까치', 2], ['참새', 3]])
})

test('dexNumbers: 나중에 이름을 붙인 기록은 이름이 붙은 시각(namedAt)으로 — 만든 시각으로 앞에 끼어들지 않는다', () => {
  // 1월에 이름 없이 저장하고 6월에 물총새라고 붙였다. 그 사이 3월에 딱새를 새로 기록했다
  const list = [rec('물총새', '2026-01-01T00:00:00Z', '2026-06-01T00:00:00Z'), rec('딱새', '2026-03-01T00:00:00Z', '2026-03-01T00:00:00Z')]
  assert.deepEqual(listOf(dexNumbers(list)), [['딱새', 1], ['물총새', 2]])
})

test('dexNumbers: 한 종의 기록을 모두 지우면 뒤 번호가 당겨진다 — 빈 번호가 없다 (사용자 결정, 작업 29)', () => {
  const list = [rec('딱새', '2026-01-01T00:00:00Z'), rec('물총새', '2026-02-01T00:00:00Z'), rec('참새', '2026-03-01T00:00:00Z')]
  assert.equal(dexNumbers(list.filter((s) => s.speciesKo !== '물총새')).get('참새'), 2)
})

test('dexNumbers: 읽을 수 없는 시각은 맨 뒤 (멈추지 않는다)', () => {
  const list = [rec('딱새', 'not-a-date'), rec('참새', '2026-03-01T00:00:00Z')]
  assert.deepEqual(listOf(dexNumbers(list)), [['참새', 1], ['딱새', 2]])
})

test('isFirstMeet: 처음 보는 이름만 true, 이름이 없으면 false', () => {
  const list = [rec('딱새', '2026-01-01T00:00:00Z')]
  assert.equal(isFirstMeet('물총새', list), true)
  assert.equal(isFirstMeet('딱새', list), false)
  assert.equal(isFirstMeet('', []), false)
})
