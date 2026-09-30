import test from 'node:test'
import assert from 'node:assert/strict'
import { countUnnamed, groupByMonth, matchesQuery, monthSections, shownRecords, sortNewest, type MonthSection } from '../src/features/records/journalList.ts'
import { outingsOf } from '../src/features/records/outings.ts'
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

test("sortNewest: 글자가 아니라 순간으로 — '+09:00'이 붙은 옛 백업의 시각이 섞여도 실제 순서 (작업 35 fix)", () => {
  // 'plus9'는 서울 22일 01:00 = 21일 16:00 UTC. 글자로 견주면 22일이라 맨 앞에 왔다
  const list = [
    rec('plus9', '2026-09-22T01:00:00+09:00'),
    rec('late', '2026-09-21T20:00:00.000Z'),
    rec('early', '2026-09-21T10:00:00.000Z'),
    rec('same-as-plus9', '2026-09-21T16:00:00.000Z'),
  ]
  assert.deepEqual(ids(sortNewest(list)), ['late', 'plus9', 'same-as-plus9', 'early'], '같은 순간이면 입력 순서 그대로')
})

test('sortNewest: 못 읽는 시각은 맨 뒤로, 멈추지 않는다', () => {
  const list = [rec('bad', 'not-a-date'), rec('ok', '2026-01-01T00:00:00.000Z')]
  assert.deepEqual(ids(sortNewest(list)), ['ok', 'bad'])
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

/** 달·덩어리 모양을 한눈에 — 덩어리마다 [머리줄 묶음의 key 또는 null, 기록 id들] */
const layout = (sections: MonthSection[]) =>
  sections.map(({ month, blocks }) => [month, blocks.map((b) => [b.outing?.key ?? null, ids(b.items)])])

/*
 * 좌표는 식으로 만든 가짜다 — 기준점(위도 10, 경도 20)에서 정북으로 m미터(1도 ≈ 111,195m).
 * 같은 날(서울 9월 22일) 아침 가까운 셋 = 한 탐조, 오후에 먼 곳 한 건, 9월 20일에 한 건, 8월에 둘(한 탐조).
 */
const north = (m: number) => ({ lat: 10 + m / 111_195, lng: 20 })
const day = [
  rec('pm-far', '2026-09-22T06:00:00.000Z', { ...north(40_000), speciesKo: '물총새', place: '연습 공원' }),
  rec('am-3', '2026-09-22T00:10:00.000Z', { ...north(900), speciesKo: '박새' }),
  rec('am-2', '2026-09-21T22:10:00.000Z', { ...north(400), speciesKo: '쇠오리' }),
  rec('am-1', '2026-09-21T21:40:00.000Z', { ...north(0), speciesKo: '박새', place: '가상 습지' }),
  rec('sep-20', '2026-09-20T01:00:00.000Z', north(0)),
  rec('aug-2', '2026-08-15T02:00:00.000Z', { ...north(100), speciesKo: '딱새' }),
  rec('aug-1', '2026-08-15T01:00:00.000Z', north(0)),
]

test('monthSections: 두 건 이상인 탐조는 머리줄 덩어리, 이어진 한 건짜리들은 머리줄 없는 덩어리 하나 — 순서는 보일 기록 그대로', () => {
  const sections = monthSections(sortNewest(day), outingsOf(day))
  assert.deepEqual(layout(sections), [
    ['2026년 9월', [[null, ['pm-far']], ['am-1', ['am-3', 'am-2', 'am-1']], [null, ['sep-20']]]],
    ['2026년 8월', [['aug-1', ['aug-2', 'aug-1']]]],
  ])
})

test('monthSections: 이어진 한 건짜리 여럿은 한 덩어리로 모인다 (PC 격자가 한 줄에 하나씩 놓이지 않게)', () => {
  const singles = [
    rec('s1', '2026-09-22T00:00:00.000Z', north(0)),
    rec('s2', '2026-09-21T00:00:00.000Z', north(0)),
    rec('s3', '2026-09-20T00:00:00.000Z', north(0)),
  ]
  assert.deepEqual(layout(monthSections(singles, outingsOf(singles))), [['2026년 9월', [[null, ['s1', 's2', 's3']]]]])
})

test('monthSections: 검색으로 한 건만 남아도 그 탐조의 머리줄과 전체 수 — 묶음은 모든 기록으로 계산한다', () => {
  const outings = outingsOf(day)
  const sections = monthSections(shownRecords(sortNewest(day), '쇠오리', false), outings)
  assert.deepEqual(layout(sections), [['2026년 9월', [['am-1', ['am-2']]]]])
  const head = sections[0].blocks[0].outing
  assert.equal(head?.items.length, 3)
  assert.deepEqual(head?.species, ['박새', '쇠오리'])
})

test('monthSections: 보일 기록이 없으면 빈 배열, 묶음에 없는 기록은 한 건짜리로 친다', () => {
  assert.deepEqual(monthSections([], outingsOf(day)), [])
  const stray = rec('stray', '2026-09-22T00:00:00.000Z')
  assert.deepEqual(layout(monthSections([stray], [])), [['2026년 9월', [[null, ['stray']]]]])
})
