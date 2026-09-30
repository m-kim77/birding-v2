import test from 'node:test'
import assert from 'node:assert/strict'
import { countUnnamed, groupByMonth, matchesQuery, shownRecords, sortNewest } from '../src/features/records/journalList.ts'
import type { Sighting } from '../src/types.ts'

/**
 * 목록 계산에 쓰는 칸만 든 가짜 기록. 오프셋은 늘 적는다 — null이면 실행 기기의 시간대를 타서 달 제목이 기기마다 달라진다.
 * 장소 이름은 지어낸 것이다.
 */
const rec = (id: string, capturedAt: string, fields: Partial<Sighting> = {}) =>
  ({ id, speciesKo: '', latin: '', place: '', note: '', capturedAt, capturedAtOffset: '+09:00', ...fields }) as Sighting

const ids = (list: Sighting[]) => list.map((s) => s.id)

test('matchesQuery: 빈 검색어·빈칸만 있는 검색어는 전부 통과', () => {
  const s = rec('a', '2026-09-01T00:00:00.000Z', { speciesKo: '딱새' })
  assert.equal(matchesQuery(s, ''), true)
  assert.equal(matchesQuery(s, '   '), true)
})

test('matchesQuery: 종 이름·학명·장소·메모 어디든, 대소문자·앞뒤 빈칸은 가리지 않는다', () => {
  const s = rec('a', '2026-09-01T00:00:00.000Z', { speciesKo: '박새', latin: 'Parus minor', place: '가상 습지', note: '두 마리가 먹이 다툼' })
  assert.equal(matchesQuery(s, '박새'), true)
  assert.equal(matchesQuery(s, 'PARUS'), true)
  assert.equal(matchesQuery(s, ' 가상 '), true)
  assert.equal(matchesQuery(s, '먹이'), true)
  assert.equal(matchesQuery(s, '물총새'), false)
})

test('matchesQuery: 칸이 빠진 옛 백업의 기록에서도 죽지 않는다', () => {
  const old = { id: 'old', capturedAt: '2026-01-01T00:00:00.000Z', speciesKo: '참새' } as Sighting
  assert.equal(matchesQuery(old, '참새'), true)
  assert.equal(matchesQuery(old, '습지'), false)
})

test('sortNewest: 촬영 시각의 최신순, 입력 배열은 그대로 둔다', () => {
  const list = [rec('mid', '2026-05-01T00:00:00.000Z'), rec('new', '2026-09-01T00:00:00.000Z'), rec('old', '2026-01-01T00:00:00.000Z')]
  assert.deepEqual(ids(sortNewest(list)), ['new', 'mid', 'old'])
  assert.deepEqual(ids(list), ['mid', 'new', 'old'])
})

test('countUnnamed: 이름이 빈 기록만 센다', () => {
  assert.equal(countUnnamed([rec('a', '2026-01-01T00:00:00.000Z', { speciesKo: '딱새' }), rec('b', '2026-01-02T00:00:00.000Z'), rec('c', '2026-01-03T00:00:00.000Z')]), 2)
  assert.equal(countUnnamed([]), 0)
})

test('shownRecords: 검색어와 "이름 미정만"을 함께 걸고, 입력 순서는 그대로', () => {
  const list = [
    rec('named', '2026-09-03T00:00:00.000Z', { speciesKo: '딱새', place: '가상 습지' }),
    rec('unnamed-here', '2026-09-02T00:00:00.000Z', { place: '가상 습지' }),
    rec('unnamed-there', '2026-09-01T00:00:00.000Z', { place: '연습 공원' }),
  ]
  assert.deepEqual(ids(shownRecords(list, '', false)), ['named', 'unnamed-here', 'unnamed-there'])
  assert.deepEqual(ids(shownRecords(list, '', true)), ['unnamed-here', 'unnamed-there'])
  assert.deepEqual(ids(shownRecords(list, '습지', true)), ['unnamed-here'])
  assert.deepEqual(shownRecords(list, '없는 말', false), [])
})

test('groupByMonth: 촬영지 달로 묶고, 처음 나온 달부터 — 달 안의 순서도 입력 그대로', () => {
  // 2026-09-30T16:00Z는 서울 10월 1일 01:00, 14:00Z는 서울 9월 30일 23:00
  const list = [
    rec('oct-1', '2026-09-30T16:00:00.000Z'),
    rec('sep-30', '2026-09-30T14:00:00.000Z'),
    rec('sep-2', '2026-09-02T00:00:00.000Z'),
    rec('aug', '2026-08-15T00:00:00.000Z'),
  ]
  const groups = groupByMonth(list).map(([month, items]) => [month, ids(items)])
  assert.deepEqual(groups, [['2026년 10월', ['oct-1']], ['2026년 9월', ['sep-30', 'sep-2']], ['2026년 8월', ['aug']]])
  assert.deepEqual(groupByMonth([]), [])
})
