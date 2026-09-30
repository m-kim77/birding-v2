import test from 'node:test'
import assert from 'node:assert/strict'
import { bySpecies } from '../src/features/dex/bySpecies.ts'
import type { Sighting } from '../src/types.ts'

/** 종별 묶기에 쓰는 칸만 든 가짜 기록 */
const rec = (id: string, speciesKo: string, capturedAt: string) => ({ id, speciesKo, capturedAt, capturedAtOffset: '+09:00' }) as Sighting

/** 결과를 [이름, 대표 id, 모든 id] 목록으로 — 순서까지 견준다 */
const shape = (entries: ReturnType<typeof bySpecies>) => entries.map((e) => [e.name, e.best.id, e.all.map((s) => s.id)])

test('bySpecies: 종마다 한 칸, 도감 번호 순', () => {
  const list = [rec('a', '물총새', '2026-03-01T00:00:00.000Z'), rec('b', '딱새', '2026-01-01T00:00:00.000Z'), rec('c', '황조롱이', '2026-04-01T00:00:00.000Z')]
  const numbers = new Map([['딱새', 1], ['물총새', 2], ['황조롱이', 3]])
  assert.deepEqual(bySpecies(list, numbers).map((e) => e.name), ['딱새', '물총새', '황조롱이'])
})

test('bySpecies: 이름 없는 기록은 도감에 넣지 않는다, 기록이 없으면 빈 목록', () => {
  const list = [rec('a', '', '2026-03-01T00:00:00.000Z'), rec('b', '참새', '2026-01-01T00:00:00.000Z')]
  assert.deepEqual(shape(bySpecies(list, new Map([['참새', 1]]))), [['참새', 'b', ['b']]])
  assert.deepEqual(bySpecies([], new Map()), [])
})

test('bySpecies: 대표는 가장 최근 기록, 그 종의 기록은 최근 것부터 — 입력 배열은 그대로 둔다', () => {
  const list = [rec('old', '딱새', '2026-01-01T00:00:00.000Z'), rec('new', '딱새', '2026-09-01T00:00:00.000Z'), rec('mid', '딱새', '2026-05-01T00:00:00.000Z')]
  assert.deepEqual(shape(bySpecies(list, new Map([['딱새', 1]]))), [['딱새', 'new', ['new', 'mid', 'old']]])
  assert.deepEqual(list.map((s) => s.id), ['old', 'new', 'mid'])
})
