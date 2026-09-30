import test from 'node:test'
import assert from 'node:assert/strict'
// 확장자를 적는 이유: node --test가 이 파일을 직접 읽는다 (Vite는 어느 쪽이든 된다)
import { EVIDENCE_LOSS_WARNING, VERDICT_NOUN, uncheckedNote, verdictHeading } from '../src/features/identify/verdictText.ts'
import type { Verdict } from '../src/types.ts'

test('verdictHeading: 저장값마다 머리글이 하나씩 — 화면 글자를 고정한다', () => {
  assert.equal(verdictHeading('확정'), 'AI 판정 · 확정')
  assert.equal(verdictHeading('좁힘'), 'AI 판정 · 좁힘')
})

test('verdictHeading: 표에 없는 값은 그 값을 그대로 붙여 보여 준다', () => {
  assert.equal(verdictHeading('몰라' as Verdict['kind']), 'AI 판정 · 몰라')
})

test('uncheckedNote: 확정이면 근거가 약할 수 있다는 말이 더 붙는다', () => {
  assert.equal(uncheckedNote('좁힘'), '자료를 확인하지 않고 답했습니다.')
  assert.equal(uncheckedNote('확정'), '자료를 확인하지 않고 답했습니다 — 확정이라도 근거가 약할 수 있습니다.')
})

test('uncheckedNote: 표에 없는 값은 확정이 아니므로 짧은 쪽이다', () => {
  assert.equal(uncheckedNote('몰라' as Verdict['kind']), '자료를 확인하지 않고 답했습니다.')
})

test('결과를 가리키는 낱말과 수정 경고 문장', () => {
  assert.equal(VERDICT_NOUN, 'AI 판정')
  assert.equal(EVIDENCE_LOSS_WARNING, '이름을 바꾸면 이 기록의 AI 판정 근거가 지워집니다.')
})
