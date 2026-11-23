import test from 'node:test'
import assert from 'node:assert/strict'
import { modelSizeText } from '../src/features/settings/modelText.ts'

test('modelSizeText: 다 받아 두면 받을 때의 양(10MB)이 아니라 기기에 차지하는 양(약 18MB) — 지우기로 돌려받는 양이다', () => {
  assert.equal(modelSizeText(0, 10, 18), '이 기기에 약 18MB')
})

test('modelSizeText: 하나도 없으면 받을 때의 양, 일부만 있으면 나머지 양', () => {
  assert.equal(modelSizeText(10, 10, 18), '받을 양 약 10MB')
  assert.equal(modelSizeText(2, 10, 18), '더 받을 양 약 2MB')
})

test('modelSizeText: 재는 중이면 빈 글, storedMb가 없으면(새소리) 받을 양과 같다고 본다', () => {
  assert.equal(modelSizeText(null, 10, 18), '')
  assert.equal(modelSizeText(0, 53), '이 기기에 약 53MB')
})
