import test from 'node:test'
import assert from 'node:assert/strict'
// 확장자를 적는 이유: node --test가 이 파일을 직접 읽는다 (Vite는 어느 쪽이든 된다)
import { EVIDENCE_LOSS_WARNING, VERDICT_NOUN, uncheckedNote, verdictHeading } from '../src/features/identify/verdictText.ts'
import type { Verdict } from '../src/types.ts'

test('verdictHeading: 저장값마다 머리글이 하나씩 — 저장값의 글자를 화면에 찍지 않는다', () => {
  assert.equal(verdictHeading('확정'), 'AI 의견 · 한 종')
  assert.equal(verdictHeading('좁힘'), 'AI 의견 · 확실하지 않음')
  for (const kind of ['확정', '좁힘'] as const) assert.ok(!verdictHeading(kind).includes(kind), `${kind} 글자가 화면에 나온다`)
})

test('verdictHeading: 표에 없는 값은 좁힘 쪽 말로 — 모르는 값을 한 종이라 하지 않는다', () => {
  assert.equal(verdictHeading('몰라' as Verdict['kind']), 'AI 의견 · 확실하지 않음')
})

test('uncheckedNote: 확정이면 근거가 약할 수 있다는 말이 더 붙는다', () => {
  assert.equal(uncheckedNote('좁힘'), '자료를 확인하지 않고 답했습니다.')
  assert.equal(uncheckedNote('확정'), '자료를 확인하지 않고 답했습니다 — 한 종으로 나왔어도 근거가 약할 수 있습니다.')
})

test('uncheckedNote: 표에 없는 값은 확정이 아니므로 짧은 쪽이다', () => {
  assert.equal(uncheckedNote('몰라' as Verdict['kind']), '자료를 확인하지 않고 답했습니다.')
})

test('결과를 가리키는 낱말과 수정 경고 문장', () => {
  assert.equal(VERDICT_NOUN, 'AI 의견')
  assert.equal(EVIDENCE_LOSS_WARNING, '이름을 바꾸면 이 기록의 AI 의견 근거가 지워집니다.')
})
