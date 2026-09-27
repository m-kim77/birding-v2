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

// ── 작업 20: 국명 자리에 국명만 ──

test('국명 자리의 영어 이름은 버리고 좁힘으로 내린다 (박새가 "Cinereous tit"로 들어가던 문제)', () => {
  const v = parseVerdict('{"verdict":"확정","korean_name":"Cinereous tit","scientific_name":"Parus minor"}', 'm')
  assert.equal(v?.speciesKo, '')
  assert.equal(v?.latin, 'Parus minor')
  assert.equal(v?.kind, '좁힘')
  assert.equal(v?.unverifiedName, 'Cinereous tit')
})

test('국명 자리에 학명이나 과 이름을 적어도 버린다', () => {
  assert.equal(parseVerdict('{"verdict":"확정","korean_name":"Parus minor","scientific_name":"Parus minor"}', 'm')?.speciesKo, '')
  assert.equal(parseVerdict('{"verdict":"확정","korean_name":"딱따구리과","scientific_name":"Picidae"}', 'm')?.speciesKo, '')
})

test("국명의 괄호 꼬리표는 떼고 받는다 ('박새 (새)' → '박새')", () => {
  const v = parseVerdict('{"verdict":"확정","korean_name":"박새 (새)","scientific_name":"Parus minor"}', 'm', new Set(['박새']))
  assert.equal(v?.speciesKo, '박새')
  assert.equal(v?.kind, '확정')
  assert.equal(v?.unverifiedName, undefined)
})

test('확인된 이름 목록을 주면 그 안의 이름만 받는다 (모델이 지어낸 국명을 막는다)', () => {
  const known = new Set(['박새', '쇠박새'])
  const made = parseVerdict('{"verdict":"확정","korean_name":"검은머리밤새","scientific_name":"Parus minor"}', 'm', known)
  assert.equal(made?.speciesKo, '')
  assert.equal(made?.kind, '좁힘')
  assert.equal(made?.unverifiedName, '검은머리밤새')
  assert.equal(parseVerdict('{"verdict":"확정","korean_name":"박새","scientific_name":"Parus minor"}', 'm', known)?.speciesKo, '박새')
})

test('목록을 주지 않으면 한글 이름인지만 본다 (옛 호출과 같다)', () => {
  assert.equal(parseVerdict('{"verdict":"확정","korean_name":"검은머리밤새","scientific_name":"X y"}', 'm')?.speciesKo, '검은머리밤새')
})

test('국명을 비워 낸 확정은 확정 그대로다 — 규칙대로 답한 것이다', () => {
  const v = parseVerdict('{"verdict":"확정","korean_name":"","scientific_name":"Otus semitorques"}', 'm', new Set(['박새']))
  assert.equal(v?.kind, '확정')
  assert.equal(v?.unverifiedName, undefined)
})

test('국명을 버린 뒤 학명도 없으면 읽을 수 없는 답이다', () => {
  assert.equal(parseVerdict('{"verdict":"확정","korean_name":"Cinereous tit"}', 'm'), null)
})

test('후보 칩도 같은 그물을 지난다 — 영어·학명·지어낸 이름·겹친 이름·판정과 같은 이름은 뺀다', () => {
  const text = '{"verdict":"좁힘","korean_name":"박새","scientific_name":"Parus minor","others":["쇠박새","Marsh tit","Poecile palustris","진박새 (새)","검은머리밤새","쇠박새","박새",7]}'
  assert.deepEqual(parseVerdict(text, 'm', new Set(['박새', '쇠박새', '진박새']))?.others, ['쇠박새', '진박새'])
})
