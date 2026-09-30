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

test("bySpecies: 대표를 순간으로 고른다 — '+09:00'이 붙은 시각이 날짜 글자만 앞서도 대표가 되지 않는다 (작업 35 fix)", () => {
  // 'plus9'는 서울 22일 01:00 = 21일 16:00 UTC로, 'utc'(21일 20:00 UTC)보다 이르다
  const list = [rec('plus9', '딱새', '2026-09-22T01:00:00+09:00'), rec('utc', '딱새', '2026-09-21T20:00:00.000Z'), rec('bad', '딱새', 'not-a-date')]
  assert.deepEqual(shape(bySpecies(list, new Map([['딱새', 1]]))), [['딱새', 'utc', ['utc', 'plus9', 'bad']]])
})

test('bySpecies: 사진 없는 최근 기록보다 사진 있는 기록이 대표 — 사진 있는 기록이 없으면 그대로 가장 최근 기록 (작업 39)', () => {
  const quick = { ...rec('quick', '딱새', '2026-09-01T00:00:00.000Z'), noPhoto: true } as Sighting
  const heard = { ...rec('heard', '딱새', '2026-08-01T00:00:00.000Z'), fromSound: true } as Sighting
  const photo = rec('photo', '딱새', '2026-01-01T00:00:00.000Z')
  assert.deepEqual(shape(bySpecies([photo, quick, heard], new Map([['딱새', 1]]))), [['딱새', 'photo', ['quick', 'heard', 'photo']]])
  assert.deepEqual(shape(bySpecies([heard, quick], new Map([['딱새', 1]]))), [['딱새', 'quick', ['quick', 'heard']]])
})
