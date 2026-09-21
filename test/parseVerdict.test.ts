import test from 'node:test'
import assert from 'node:assert/strict'
import { parseVerdict } from '../src/features/identify/parseVerdict.ts'

const GOOD = '{"verdict":"확정","korean_name":"물총새","scientific_name":"Alcedo atthis","summary":"청록색 등","evidence":[{"text":"등은 청록색","source":"위키백과 · 물총새"}],"others":[]}'

test('깨끗한 JSON을 읽는다', () => {
  const v = parseVerdict(GOOD, 'test-model')
  assert.equal(v?.kind, '확정')
  assert.equal(v?.speciesKo, '물총새')
  assert.equal(v?.evidence.length, 1)
  assert.equal(v?.model, 'test-model')
})

test('생각 태그·코드 울타리·앞뒤 말이 붙어 있어도 읽는다', () => {
  const v = parseVerdict(`<think>{"이건": "무시"}</think>판정 결과입니다.\n\`\`\`json\n${GOOD}\n\`\`\`\n이상입니다.`, 'm')
  assert.equal(v?.latin, 'Alcedo atthis')
})

test("'확정'이 아닌 모든 verdict는 '좁힘'으로 읽는다 (모호한 답을 확정으로 올리지 않는다)", () => {
  assert.equal(parseVerdict('{"verdict":"아마도","scientific_name":"Parus minor"}', 'm')?.kind, '좁힘')
})

test('한국어 이름이 없어도 학명이 있으면 받아들인다 (국명을 지어내게 하지 않는다)', () => {
  const v = parseVerdict('{"verdict":"확정","korean_name":"","scientific_name":"Parus minor"}', 'm')
  assert.equal(v?.speciesKo, '')
  assert.equal(v?.latin, 'Parus minor')
})

test('읽을 수 없는 답은 null', () => {
  assert.equal(parseVerdict('죄송합니다, 판정할 수 없습니다.', 'm'), null)
  assert.equal(parseVerdict('{"verdict":"확정"}', 'm'), null)
  assert.equal(parseVerdict('{깨진 json', 'm'), null)
})

test('evidence의 모양이 틀려도 죽지 않고 쓸 수 있는 것만 남긴다', () => {
  const v = parseVerdict('{"verdict":"확정","scientific_name":"X y","evidence":[null,{"text":"사실"},{"source":"출처만"},"문자열"]}', 'm')
  assert.deepEqual(v?.evidence, [{ text: '사실', source: '' }])
})
