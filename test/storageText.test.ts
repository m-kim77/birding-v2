import test from 'node:test'
import assert from 'node:assert/strict'
import { NEAR_QUOTA, bytesText, missingKindsText, missingRows, usageLine } from '../src/features/settings/storageText.ts'
import type { Sighting } from '../src/types.ts'

const KB = 1024
const MB = KB * 1024
const GB = MB * 1024

test('bytesText: KB·MB·GB와 소수 자리', () => {
  assert.equal(bytesText(500), '1KB', '1KB 미만도 0이 아니라 1KB')
  assert.equal(bytesText(850 * KB), '850KB')
  assert.equal(bytesText(4.2 * MB), '4.2MB')
  assert.equal(bytesText(1 * MB), '1MB', "끝의 '.0'은 뗀다")
  assert.equal(bytesText(48.4 * MB), '48MB', '10MB부터는 정수')
  assert.equal(bytesText(1.3 * GB), '1.3GB')
})

test('bytesText: 반올림이 단위를 넘으면 위 단위로 — 1024KB·1024MB로 적지 않는다', () => {
  assert.equal(bytesText(MB - 1), '1MB')
  assert.equal(bytesText(9.96 * MB), '10MB')
  assert.equal(bytesText(1023.4 * MB), '1023MB')
  assert.equal(bytesText(1023.6 * MB), '1GB')
})

test('bytesText: 0·음수·NaN·무한대는 0KB (화면에 NaN을 내지 않는다)', () => {
  for (const n of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) assert.equal(bytesText(n), '0KB')
})

test('usageLine: 쓰는 양을 모르면 null, 평소에는 한도를 적지 않는다', () => {
  assert.equal(usageLine({ usage: null, quota: 10 * GB }), null)
  assert.deepEqual(usageLine({ usage: 48 * MB, quota: 300 * GB }), { tone: 'plain', text: '약 48MB를 쓰고 있습니다' })
  assert.deepEqual(usageLine({ usage: 48 * MB, quota: null }), { tone: 'plain', text: '약 48MB를 쓰고 있습니다' }, '한도를 모르면 경고하지 않는다')
  assert.equal(usageLine({ usage: 48 * MB, quota: 0 })?.tone, 'plain', '한도 0은 모르는 것으로 (0으로 나누지 않는다)')
})

test(`usageLine: 한도의 ${NEAR_QUOTA * 100}%부터 한도와 함께 warn`, () => {
  assert.equal(usageLine({ usage: 79 * MB, quota: 100 * MB })?.tone, 'plain')
  const near = usageLine({ usage: 80 * MB, quota: 100 * MB })
  assert.equal(near?.tone, 'warn')
  assert.match(near!.text, /약 100MB/)
  assert.match(near!.text, /백업/)
})

test('missingKindsText: 무엇이 없는지 쉬운 말로', () => {
  assert.equal(missingKindsText(['full', 'thumb']), '사진 없음')
  assert.equal(missingKindsText(['full']), '큰 사진 없음')
  assert.equal(missingKindsText(['thumb']), '목록 사진 없음')
  assert.equal(missingKindsText([]), '')
})

/** 검사에 필요한 값만 채운 기록 */
function sighting(id: string, capturedAt: string): Sighting {
  return { id, capturedAt } as Sighting
}

test('missingRows: 최신 촬영부터 — 점검이 주는 순서(id 순)와 상관없다', () => {
  const sightings = [sighting('a', '2026-09-01T00:00:00.000Z'), sighting('b', '2026-09-03T00:00:00.000Z'), sighting('c', '2026-09-02T00:00:00.000Z')]
  const rows = missingRows([{ id: 'a', kinds: ['full'] }, { id: 'b', kinds: ['thumb'] }, { id: 'c', kinds: ['full', 'thumb'] }], sightings)
  assert.deepEqual(rows.map((r) => r.s.id), ['b', 'c', 'a'])
})

test("missingRows: 촬영 시각을 순간으로 견준다 — '+09:00'이 붙은 시각이 날짜 글자만 앞서도 앞에 오지 않는다 (작업 35 fix)", () => {
  // 'plus9'는 서울 22일 01:00 = 21일 16:00 UTC로, 'utc'(21일 20:00 UTC)보다 이르다. 못 읽는 시각은 맨 뒤
  const sightings = [sighting('plus9', '2026-09-22T01:00:00+09:00'), sighting('utc', '2026-09-21T20:00:00.000Z'), sighting('bad', 'not-a-date')]
  const rows = missingRows([{ id: 'bad', kinds: ['full'] }, { id: 'plus9', kinds: ['full'] }, { id: 'utc', kinds: ['full'] }], sightings)
  assert.deepEqual(rows.map((r) => r.s.id), ['utc', 'plus9', 'bad'])
})

test('missingRows: 없는 판은 점검이 준 그대로, 기록은 화면 쪽 것을 쓴다', () => {
  const s = sighting('a', '2026-09-01T00:00:00.000Z')
  const [row] = missingRows([{ id: 'a', kinds: ['thumb'] }], [s])
  assert.equal(row.s, s)
  assert.deepEqual(row.kinds, ['thumb'])
})

test('missingRows: 화면 기록에 없는 id는 줄로 그리지 않는다 (점검과 화면 상태가 잠깐 어긋나도)', () => {
  const rows = missingRows([{ id: 'gone', kinds: ['full'] }, { id: 'a', kinds: ['full'] }], [sighting('a', '2026-09-01T00:00:00.000Z')])
  assert.deepEqual(rows.map((r) => r.s.id), ['a'])
})

test('missingRows: 사진이 빠진 기록이 없거나 기록이 하나도 없으면 빈 목록', () => {
  assert.deepEqual(missingRows([], [sighting('a', '2026-09-01T00:00:00.000Z')]), [])
  assert.deepEqual(missingRows([{ id: 'a', kinds: ['full'] }], []), [])
})

test('missingRows: 받은 점검 결과의 순서를 바꾸지 않는다 (입력을 제자리에서 정렬하지 않는다)', () => {
  const missing = [{ id: 'a', kinds: ['full' as const] }, { id: 'b', kinds: ['full' as const] }]
  missingRows(missing, [sighting('a', '2026-09-01T00:00:00.000Z'), sighting('b', '2026-09-02T00:00:00.000Z')])
  assert.deepEqual(missing.map((m) => m.id), ['a', 'b'])
})
