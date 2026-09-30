import test from 'node:test'
import assert from 'node:assert/strict'
import { pointCountText, progressOf, summaryOf, trackRangeText, tracksSyncLine } from '../src/features/tracks/trackText.ts'
import type { TracksMeta } from '../src/data/tracks'

// 시각은 모두 지어낸 것이고 좌표는 다루지 않는다. 날짜는 로컬 시간으로 만든다 — 화면이 브라우저 시간대로 풀기 때문에 실행 TZ와 무관하게 같은 날짜가 나온다.
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h, 0).toISOString()
const NOW = new Date(2026, 9, 1, 9, 0)

/** 요약 하나. 범위는 같은 해(2026) 5월 22일 ~ 8월 20일, 넣은 날은 NOW보다 3일 전 */
const metaOf = (over: Partial<TracksMeta> = {}): TracksMeta => ({
  v: 1,
  rangeStart: at(2026, 5, 22),
  rangeEnd: at(2026, 8, 20),
  count: 1234,
  importedAt: at(2026, 9, 28),
  ...over,
})

test('progressOf: 읽기·파싱은 고정값(0.1·0.5) — 진행률을 못 줘도 멈추지 않았다는 것만 보인다', () => {
  assert.deepEqual(progressOf({ stage: 'reading' }), { value: 0.1, text: '파일을 읽는 중…' })
  assert.deepEqual(progressOf({ stage: 'parsing' }), { value: 0.5, text: '점을 고르는 중…' })
  assert.deepEqual(progressOf({ stage: 'reading', done: 9, total: 9 }), { value: 0.1, text: '파일을 읽는 중…' }, '읽기에서는 done·total을 보지 않는다')
})

test('progressOf: 저장은 날짜 수로 잰다 (done/total)', () => {
  assert.deepEqual(progressOf({ stage: 'saving', done: 3, total: 12 }), { value: 0.25, text: '저장하는 중 · 3/12일' })
  assert.deepEqual(progressOf({ stage: 'saving', done: 12, total: 12 }), { value: 1, text: '저장하는 중 · 12/12일' })
  assert.equal(progressOf({ stage: 'saving', done: 0, total: 12 }).value, 0)
})

test('progressOf: 저장인데 total이 0이거나 없으면 0으로 나누지 않고 0 — done이 없어도 0', () => {
  assert.deepEqual(progressOf({ stage: 'saving', done: 0, total: 0 }), { value: 0, text: '저장하는 중 · 0/0일' })
  assert.deepEqual(progressOf({ stage: 'saving' }), { value: 0, text: '저장하는 중 · 0/0일' })
  assert.equal(progressOf({ stage: 'saving', done: 5 }).value, 0, 'total이 없으면 done이 있어도 0')
})

test('pointCountText: 세 자리마다 쉼표와 "점"', () => {
  assert.equal(pointCountText(1234567), '1,234,567점')
  assert.equal(pointCountText(999), '999점')
  assert.equal(pointCountText(0), '0점')
})

test('trackRangeText: 두 끝이 올해면 연도 없이 "M월 D일 ~ M월 D일"', () => {
  assert.equal(trackRangeText(metaOf(), NOW), '5월 22일 ~ 8월 20일')
})

test('trackRangeText: 올해가 아닌 쪽에만 연도를 붙인다', () => {
  assert.equal(trackRangeText(metaOf({ rangeStart: at(2025, 11, 3) }), NOW), '2025년 11월 3일 ~ 8월 20일')
  assert.equal(trackRangeText(metaOf({ rangeStart: at(2024, 12, 30), rangeEnd: at(2025, 1, 2) }), NOW), '2024년 12월 30일 ~ 2025년 1월 2일')
  assert.equal(trackRangeText(metaOf(), new Date(2027, 0, 5)), '2026년 5월 22일 ~ 2026년 8월 20일', '연도의 기준은 now다')
})

test('trackRangeText: 못 읽는 시각이 하나라도 있으면 "기간을 읽지 못함" — NaN을 화면에 내지 않는다', () => {
  assert.equal(trackRangeText(metaOf({ rangeStart: 'garbage' }), NOW), '기간을 읽지 못함')
  assert.equal(trackRangeText(metaOf({ rangeEnd: '' }), NOW), '기간을 읽지 못함')
})

test('summaryOf: 범위 · 점 수 · 넣은 날 — 가운뎃점으로 이은 한 줄', () => {
  assert.equal(summaryOf(metaOf(), NOW), '5월 22일 ~ 8월 20일 · 1,234점 · 넣은 날 3일 전')
})

test('summaryOf: 넣은 날이 오늘·어제면 그 말로', () => {
  assert.equal(summaryOf(metaOf({ importedAt: at(2026, 10, 1, 1) }), NOW), '5월 22일 ~ 8월 20일 · 1,234점 · 넣은 날 오늘')
  assert.equal(summaryOf(metaOf({ importedAt: at(2026, 9, 30, 23) }), NOW), '5월 22일 ~ 8월 20일 · 1,234점 · 넣은 날 어제')
})

test('summaryOf: 넣은 시각을 못 읽으면 그 부분만 뺀다', () => {
  assert.equal(summaryOf(metaOf({ importedAt: 'garbage' }), NOW), '5월 22일 ~ 8월 20일 · 1,234점')
  assert.equal(summaryOf(metaOf({ importedAt: '' }), NOW), '5월 22일 ~ 8월 20일 · 1,234점')
})

test('summaryOf: 기간을 못 읽어도 나머지는 그대로 (줄이 통째로 사라지지 않는다)', () => {
  assert.equal(summaryOf(metaOf({ rangeEnd: 'garbage' }), NOW), '기간을 읽지 못함 · 1,234점 · 넣은 날 3일 전')
})

test('summaryOf: now를 안 주면 지금 — 범위의 연도와 넣은 날 둘 다 같은 기준', () => {
  const line = summaryOf(metaOf({ rangeStart: at(2001, 5, 22), rangeEnd: at(2001, 8, 20), importedAt: at(2001, 9, 1) }))
  assert.match(line, /^2001년 5월 22일 ~ 2001년 8월 20일 · 1,234점 · 넣은 날 \d+일 전$/)
})

test('tracksSyncLine: 아직 맞춰 보지 않았으면 줄이 없다', () => {
  assert.equal(tracksSyncLine(null), null)
})

test('tracksSyncLine: 맞추는 중 · 드라이브와 같음(점 수, 0점이면 없음) — ok', () => {
  assert.deepEqual(tracksSyncLine({ kind: 'syncing' }), { tone: 'ok', text: '드라이브와 맞추는 중…' })
  assert.deepEqual(tracksSyncLine({ kind: 'same', count: 22426 }), { tone: 'ok', text: '드라이브와 같습니다 · 22,426점' })
  assert.deepEqual(tracksSyncLine({ kind: 'same', count: 0 }), { tone: 'ok', text: '드라이브와 같습니다 · 아직 이동 기록 없음' })
})

test('tracksSyncLine: 못 맞춤(이유가 있으면 뒤에) · 다른 기기가 드라이브에서 지움 — warn', () => {
  assert.deepEqual(tracksSyncLine({ kind: 'failed', reason: '드라이브가 요청을 거절했습니다 (403).' }), {
    tone: 'warn', text: '아직 드라이브와 맞추지 못했습니다. 다음 동기화 때 다시 합니다. 이유: 드라이브가 요청을 거절했습니다 (403).',
  })
  assert.deepEqual(tracksSyncLine({ kind: 'failed', reason: '' }), { tone: 'warn', text: '아직 드라이브와 맞추지 못했습니다. 다음 동기화 때 다시 합니다.' })
  const cleared = tracksSyncLine({ kind: 'clearedElsewhere' })
  assert.equal(cleared?.tone, 'warn')
  assert.match(cleared?.text ?? '', /올리기를 껐습니다/)
})
