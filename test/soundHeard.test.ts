import test from 'node:test'
import assert from 'node:assert/strict'
import { addWindow, clockOf, isSpecies, lastHeard, MIN_SCORE, nameOf, sortHeard, supportMultiplier, SURE_SCORE, type HeardSpecies } from '../src/features/sound/heard.ts'
import type { SoundGuess } from '../src/features/sound/classifier.ts'

const tit = (score: number): SoundGuess => ({ latin: 'Parus minor', en: 'Japanese Tit', ko: '박새', score })
const bulbul = (score: number): SoundGuess => ({ latin: 'Hypsipetes amaurotis', en: 'Brown-eared Bulbul', ko: '직박구리', score })

/** 종 하나짜리 목록을 손으로 만든다 (순서·가산 시험용) */
const heardOf = (latin: string, peak: number, spans: Array<[number, number]>): HeardSpecies => ({ latin, labelKo: '', labelEn: '', peak, windows: spans.length, spans })

test('isSpecies: 학명 꼴만 종으로 본다', () => {
  assert.equal(isSpecies(tit(0.9)), true)
  assert.equal(isSpecies({ latin: 'Motacilla alba lugens', en: 'Black-backed Wagtail', ko: '', score: 0.9 }), true, '아종(세 낱말)')
  assert.equal(isSpecies({ latin: 'Engine', en: 'Engine', ko: '', score: 0.9 }), false)
  assert.equal(isSpecies({ latin: 'confidence', en: '', ko: '', score: 0.9 }), false, '열 이름')
  assert.equal(isSpecies({ latin: '', en: '', ko: '', score: 0.9 }), false)
})

test('isSpecies: 학명 자리와 영어 이름 자리가 같은 줄은 새가 아니다 (Human vocal · Power tools)', () => {
  // 'Human vocal'은 속명·종소명처럼 생겨서 꼴만 보면 통과한다 — v1은 이 글자들을 목록으로 막았다
  assert.equal(isSpecies({ latin: 'Human vocal', en: 'Human vocal', ko: '', score: 0.9 }), false)
  assert.equal(isSpecies({ latin: 'Power tools', en: 'Power tools', ko: '', score: 0.9 }), false)
})

test('addWindow: 하한을 넘은 종만 올리고, 받은 목록은 고치지 않는다', () => {
  const before: HeardSpecies[] = []
  const after = addWindow(before, [tit(0.86), bulbul(MIN_SCORE - 0.01)], 0)
  assert.equal(before.length, 0)
  assert.deepEqual(after, [{ latin: 'Parus minor', labelKo: '박새', labelEn: 'Japanese Tit', peak: 0.86, windows: 1, spans: [[0, 3]] }])
})

test('addWindow: 하한과 같은 점수는 올린다', () => {
  assert.equal(addWindow([], [tit(MIN_SCORE)], 0).length, 1)
})

test('addWindow: 올릴 것이 없으면 받은 목록을 그대로 돌려준다 (화면을 다시 그리지 않게)', () => {
  const list = addWindow([], [tit(0.9)], 0)
  assert.equal(addWindow(list, [], 1.5), list)
  assert.equal(addWindow(list, [{ latin: 'Siren', en: 'Siren', ko: '', score: 0.99 }], 1.5), list)
  assert.equal(addWindow(list, [tit(Number.NaN)], 1.5), list)
})

test('addWindow: 겹치는 창에서 이어 들린 종은 한 덩어리다', () => {
  let list = addWindow([], [tit(0.7)], 0)
  list = addWindow(list, [tit(0.9)], 1.5)
  list = addWindow(list, [tit(0.8)], 3)
  assert.deepEqual(list[0].spans, [[0, 6]])
  assert.equal(list[0].windows, 3)
  assert.equal(list[0].peak, 0.9)
})

test('addWindow: 1.5초 안에 다시 들리면 같은 덩어리, 넘으면 새 덩어리', () => {
  // 앞 덩어리의 끝 3초 → 다음 창의 시작 4.5초: 간격이 꼭 1.5초
  assert.deepEqual(addWindow(addWindow([], [tit(0.7)], 0), [tit(0.7)], 4.5)[0].spans, [[0, 7.5]])
  // 시작 6초: 간격 3초
  const apart = addWindow(addWindow([], [tit(0.7)], 0), [tit(0.7)], 6)[0]
  assert.deepEqual(apart.spans, [[0, 3], [6, 9]])
  assert.equal(lastHeard(apart), 9)
})

test('addWindow: 같은 창에 같은 종이 두 번 오면 높은 점수 하나로 센다', () => {
  const list = addWindow([], [tit(0.4), { ...tit(0.8), latin: ' Parus  minor ' }], 0)
  assert.equal(list.length, 1)
  assert.equal(list[0].peak, 0.8)
  assert.equal(list[0].windows, 1)
})

test('addWindow: 여러 종이 같이 울면 다 올린다 (v1처럼 1순위만 세지 않는다)', () => {
  const list = addWindow([], [tit(0.9), bulbul(0.6)], 0)
  assert.deepEqual(list.map((h) => h.latin), ['Parus minor', 'Hypsipetes amaurotis'])
})

test('addWindow: 1을 넘는 점수는 1로 본다', () => {
  assert.equal(addWindow([], [tit(1.2)], 0)[0].peak, 1)
})

test('supportMultiplier: 한 덩어리는 가산 없음, 여덟 덩어리에서 상한 1.15 (v1과 같은 값)', () => {
  assert.equal(supportMultiplier(0), 1)
  assert.equal(supportMultiplier(1), 1)
  assert.ok(Math.abs(supportMultiplier(2) - 1.05) < 1e-9)
  assert.ok(Math.abs(supportMultiplier(4) - 1.1) < 1e-9)
  assert.ok(Math.abs(supportMultiplier(8) - 1.15) < 1e-9)
  assert.ok(Math.abs(supportMultiplier(25) - 1.15) < 1e-9)
})

test('sortHeard: 한 번 크게 들린 종이 여러 번 약하게 들린 종을 이긴다', () => {
  const many: Array<[number, number]> = Array.from({ length: 25 }, (_, i) => [i * 10, i * 10 + 3])
  const sorted = sortHeard([heardOf('Corvus monedula', 0.632, many), heardOf('Pica pica', 0.937, [[0, 3]])])
  assert.equal(sorted[0].latin, 'Pica pica')
})

test('sortHeard: 문턱을 넘은 종은 못 넘은 종 아래로 가지 않는다', () => {
  // 가산만 보면 0.49 × 1.079(세 덩어리) = 0.529 > 0.52
  const sorted = sortHeard([heardOf('Aaa bbb', SURE_SCORE - 0.01, [[0, 3], [10, 13], [20, 23]]), heardOf('Ccc ddd', SURE_SCORE + 0.02, [[0, 3]])])
  assert.equal(sorted[0].latin, 'Ccc ddd')
})

test('sortHeard: 점수가 같으면 먼저 들린 종이 위, 받은 목록은 고치지 않는다', () => {
  const list = [heardOf('Bbb ccc', 0.8, [[6, 9]]), heardOf('Aaa bbb', 0.8, [[0, 3]])]
  assert.deepEqual(sortHeard(list).map((h) => h.latin), ['Aaa bbb', 'Bbb ccc'])
  assert.equal(list[0].latin, 'Bbb ccc')
})

test('nameOf: 국명은 앱의 종 표가 이름표보다 먼저다', () => {
  // BirdNET 이름표는 대백로를 '중대백로'로 적는다 (작업 31)
  assert.deepEqual(nameOf({ latin: 'Ardea alba', labelKo: '중대백로', labelEn: 'Great Egret' }), { title: '대백로', sub: 'Ardea alba' })
})

test('nameOf: 종 표에 없으면 이름표의 한국어, 그것도 없으면 학명을 제목으로', () => {
  assert.deepEqual(nameOf({ latin: 'Halcyon coromanda', labelKo: '호반새', labelEn: 'Ruddy Kingfisher' }), { title: '호반새', sub: 'Halcyon coromanda' })
  assert.deepEqual(nameOf({ latin: 'Ramphocaenus melanurus', labelKo: '', labelEn: 'Long-billed Gnatwren' }), { title: 'Ramphocaenus melanurus', sub: 'Long-billed Gnatwren' })
})

test('nameOf: 이름표의 한국어 자리에 영어 이름이 그대로 든 줄은 국명으로 쓰지 않는다', () => {
  assert.deepEqual(nameOf({ latin: 'Ramphocaenus melanurus', labelKo: 'Long-billed Gnatwren', labelEn: 'Long-billed Gnatwren' }), { title: 'Ramphocaenus melanurus', sub: 'Long-billed Gnatwren' })
})

test('clockOf: 분:초, 이상한 값은 0:00', () => {
  assert.equal(clockOf(0), '0:00')
  assert.equal(clockOf(7.9), '0:07')
  assert.equal(clockOf(750), '12:30')
  assert.equal(clockOf(-3), '0:00')
  assert.equal(clockOf(Number.NaN), '0:00')
})
