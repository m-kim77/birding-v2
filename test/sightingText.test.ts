import test from 'node:test'
import assert from 'node:assert/strict'
import { UNNAMED, nameText } from '../src/ui/sightingText.ts'

test("nameText: 이름이 비어 있으면 '이름 미정', 있으면 그대로 — 화면 글자를 고정한다", () => {
  assert.equal(UNNAMED, '이름 미정')
  assert.equal(nameText(''), '이름 미정')
  assert.equal(nameText(undefined), '이름 미정')
  assert.equal(nameText('딱새'), '딱새')
})
