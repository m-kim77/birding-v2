import test from 'node:test'
import assert from 'node:assert/strict'
import { fromTimeInput, toTimeInput } from '../src/lib/captureTime.ts'
import { browserOffsetFor } from '../src/lib/exif.ts'

test('toTimeInput: 기록의 오프셋으로 푼 촬영지 시각 — 초는 버린다', () => {
  // 2026-09-22 01:30:59 KST = 2026-09-21T16:30:59Z — UTC로 자르면 전날이 된다
  assert.equal(toTimeInput('2026-09-21T16:30:59.000Z', '+09:00'), '2026-09-22T01:30')
  assert.equal(toTimeInput('2026-08-02T15:47:39.734Z', '-04:00'), '2026-08-02T11:47')
  // 작업 8이 시각 없는 옛 기록에 넣는 자리표도 입력칸에 채워진다 (고칠 수 있어야 한다)
  assert.equal(toTimeInput('1970-01-01T00:00:00.000Z', '+09:00'), '1970-01-01T09:00')
})

test('toTimeInput: 못 읽는 시각이면 빈 문자열', () => {
  assert.equal(toTimeInput('garbage', '+09:00'), '')
  assert.equal(toTimeInput('', null), '')
})

test('fromTimeInput: 입력은 기록의 오프셋으로 읽고, 오프셋은 그대로 둔다', () => {
  assert.deepEqual(fromTimeInput('2026-09-22T01:30', '+09:00'), { capturedAt: '2026-09-21T16:30:00.000Z', capturedAtOffset: '+09:00' })
  // 뉴욕에서 찍은 기록은 어디서 고쳐도 뉴욕 시각으로 읽는다 — 브라우저 시간대로 읽으면 시차만큼 밀린다
  assert.deepEqual(fromTimeInput('2026-08-02T11:47', '-04:00'), { capturedAt: '2026-08-02T15:47:00.000Z', capturedAtOffset: '-04:00' })
})

test('fromTimeInput: 입력칸이 초를 주면 쓴다', () => {
  assert.equal(fromTimeInput('2026-09-22T01:30:15', '+09:00')?.capturedAt, '2026-09-21T16:30:15.000Z')
})

test('toTimeInput ↔ fromTimeInput 왕복 — 여러 오프셋에서 같은 순간(분까지)으로 돌아온다', () => {
  const instants = ['2026-09-21T16:30:00.000Z', '2026-01-01T00:00:00.000Z', '2026-12-31T23:59:00.000Z', '2026-03-08T07:30:00.000Z']
  for (const offset of ['+09:00', '-04:00', '+05:30', '+00:00', '-09:30']) {
    for (const iso of instants) {
      const back = fromTimeInput(toTimeInput(iso, offset), offset)
      assert.equal(back?.capturedAt, iso, `${iso} ${offset}`)
      assert.equal(back?.capturedAtOffset, offset)
    }
  }
})

test('fromTimeInput: 오프셋을 모르는 기록에는 입력한 날짜의 브라우저(여기서는 node) 오프셋을 붙인다', () => {
  const r = fromTimeInput('2026-09-22T01:30', null)
  assert.ok(r)
  assert.equal(r.capturedAtOffset, browserOffsetFor(2026, 9, 22))
  // 붙인 오프셋으로 다시 보면 입력한 그 시각이다 — 어느 시간대에서 열어도 같게 보인다
  assert.equal(toTimeInput(r.capturedAt, r.capturedAtOffset), '2026-09-22T01:30')
  // 형식이 틀린 오프셋도 모르는 것으로 친다
  assert.equal(fromTimeInput('2026-09-22T01:30', 'KST')?.capturedAtOffset, browserOffsetFor(2026, 9, 22))
})

test('fromTimeInput: 빈칸·덜 쓴 값·없는 날짜와 시각은 null (Date가 말없이 넘기는 값도)', () => {
  for (const bad of ['', '2026-09-22', '2026-09-22T01', '2026-9-22T1:30', 'garbage', '2026-02-30T10:00', '2026-09-31T10:00', '2026-09-22T24:00', '2026-09-22T25:00', '2026-13-01T10:00', '2026-09-22T10:60', '2026-09-22T10:00:60']) {
    assert.equal(fromTimeInput(bad, '+09:00'), null, bad)
  }
  // 윤년의 2월 29일은 있다
  assert.equal(fromTimeInput('2028-02-29T10:00', '+09:00')?.capturedAt, '2028-02-29T01:00:00.000Z')
})
