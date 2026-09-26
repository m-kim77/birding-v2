import test from 'node:test'
import assert from 'node:assert/strict'
import { NEAR_QUOTA, bytesText, missingKindsText, usageLine } from '../src/features/settings/storageText.ts'

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
