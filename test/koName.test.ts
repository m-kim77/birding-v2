import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanKoName, koNamesIn } from '../src/features/identify/koName.ts'

test('cleanKoName: 한글 이름은 그대로, 앞뒤 공백은 뗀다', () => {
  assert.equal(cleanKoName('물총새'), '물총새')
  assert.equal(cleanKoName('  박새 '), '박새')
  assert.equal(cleanKoName('검은머리 갈매기'), '검은머리 갈매기')
})

test("cleanKoName: 위키백과의 괄호 꼬리표를 뗀다 ('박새 (새)' → '박새')", () => {
  assert.equal(cleanKoName('박새 (새)'), '박새')
  assert.equal(cleanKoName('박새(Parus minor)'), '박새')
})

test('cleanKoName: 영어 이름·학명은 버린다 (작업 20의 실제 사례: 박새가 "Cinereous tit"로 들어갔다)', () => {
  assert.equal(cleanKoName('Cinereous tit'), '')
  assert.equal(cleanKoName('Parus minor'), '')
  assert.equal(cleanKoName('Turdus merula / Turdus mandarinus'), '')
})

test('cleanKoName: 한글과 다른 글자가 섞인 글은 버린다', () => {
  assert.equal(cleanKoName('박새 Cinereous tit'), '')
  assert.equal(cleanKoName('박새/쇠박새'), '')
  assert.equal(cleanKoName('박새, 쇠박새'), '')
})

test('cleanKoName: 과·목·속 이름은 종의 이름이 아니다', () => {
  for (const rank of ['딱따구리과', '참새목', '소쩍새속', '오리아과', '갈매기류']) assert.equal(cleanKoName(rank), '', rank)
})

test('cleanKoName: 글자가 아니거나 비었으면 빈 문자열 (죽지 않는다)', () => {
  for (const v of [null, undefined, 3, {}, [], '', '   ', '(새)']) assert.equal(cleanKoName(v), '')
})

test('koNamesIn: 국명 도구·읽은 문서·검색 결과에서 쓸 수 있는 이름만 모은다', () => {
  assert.deepEqual(koNamesIn({ scientific_name: 'Alcedo atthis', korean_name: '물총새' }), ['물총새'])
  assert.deepEqual(koNamesIn({ title: '박새 (새)', text: '…', url: 'https://ko.wikipedia.org/wiki/박새_(새)' }), ['박새'])
  assert.deepEqual(koNamesIn({ results: [{ title: '쇠박새', snippet: '' }, { title: '박새과', snippet: '' }, { title: 'Marsh tit', snippet: '' }] }), ['쇠박새'])
})

test('koNamesIn: 못 찾은 답·오류·이상한 모양에서는 아무것도 모으지 않는다', () => {
  assert.deepEqual(koNamesIn({ scientific_name: 'X y', korean_name: null, note: '확인하지 못했습니다' }), [])
  assert.deepEqual(koNamesIn({ error: '위키백과에 닿지 못했습니다.' }), [])
  assert.deepEqual(koNamesIn({ title: 'Cinereous tit' }), [])
  assert.deepEqual(koNamesIn({ results: [null, 'x', { title: 7 }] }), [])
  for (const v of [null, undefined, 'text', 3]) assert.deepEqual(koNamesIn(v), [])
})
