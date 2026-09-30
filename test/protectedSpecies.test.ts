import test from 'node:test'
import assert from 'node:assert/strict'
import { ENDANGERED_1, ENDANGERED_2, MONUMENT_BIRDS, PROTECTED, hideHint, protectionLine, protectionOf } from '../src/data/protectedSpecies.ts'

// 이름은 모두 공식 목록(시행규칙 별표 1 · 국가유산청 천연기념물 목록)에 있는 종명이다 — 지어낸 이름은 '없는 이름' 쪽에만 쓴다

test('수: 멸종위기 Ⅰ급 16 · Ⅱ급 53 · 천연기념물 46, 합쳐서 79종 (둘 다인 종 36)', () => {
  assert.equal(ENDANGERED_1.length, 16)
  assert.equal(ENDANGERED_2.length, 53)
  assert.equal(MONUMENT_BIRDS.length, 46)
  assert.equal(PROTECTED.length, 79)
  assert.equal(PROTECTED.filter((p) => p.endangered && p.monument).length, 36)
  assert.equal(PROTECTED.filter((p) => !p.endangered && p.monument).length, 10)
})

test('목록마다 같은 이름이 두 번 없고, Ⅰ급과 Ⅱ급에 함께 든 이름도 없다', () => {
  for (const list of [ENDANGERED_1, ENDANGERED_2, MONUMENT_BIRDS]) assert.equal(new Set(list).size, list.length)
  assert.deepEqual(ENDANGERED_1.filter((ko) => ENDANGERED_2.includes(ko)), [])
})

test('원문에서 고른 이름이 제 급에 있다 — 목록의 처음·끝과 두 목록에 걸친 종', () => {
  assert.deepEqual(protectionOf('검독수리'), { ko: '검독수리', endangered: 1, monument: true })
  assert.deepEqual(protectionOf('넓적부리도요'), { ko: '넓적부리도요', endangered: 1 })
  assert.deepEqual(protectionOf('청다리도요사촌'), { ko: '청다리도요사촌', endangered: 1 })
  assert.deepEqual(protectionOf('흰꼬리수리'), { ko: '흰꼬리수리', endangered: 1, monument: true })
  assert.deepEqual(protectionOf('개리'), { ko: '개리', endangered: 2, monument: true })
  assert.deepEqual(protectionOf('솔개'), { ko: '솔개', endangered: 2 })
  assert.deepEqual(protectionOf('새매'), { ko: '새매', endangered: 2, monument: true })
  assert.deepEqual(protectionOf('큰기러기'), { ko: '큰기러기', endangered: 2 })
  assert.deepEqual(protectionOf('흰죽지수리'), { ko: '흰죽지수리', endangered: 2 })
})

test('천연기념물에만 있는 종 10: 급이 없다', () => {
  const only = PROTECTED.filter((p) => !p.endangered).map((p) => p.ko)
  assert.deepEqual(only, ['개구리매', '황조롱이', '솔부엉이', '쇠부엉이', '칡부엉이', '소쩍새', '큰소쩍새', '원앙', '두견', '호사도요'])
  assert.deepEqual(protectionOf('원앙'), { ko: '원앙', monument: true })
})

test('두 기관의 다른 표기는 한 종으로 — 둘 다 찾히고 법령 표기로 돌려준다', () => {
  const woodpecker = { ko: '까막딱다구리', endangered: 2, monument: true }
  assert.deepEqual(protectionOf('까막딱다구리'), woodpecker)
  assert.deepEqual(protectionOf('까막딱따구리'), woodpecker)
  const bustard = { ko: '느시', endangered: 1, monument: true }
  assert.deepEqual(protectionOf('느시'), bustard)
  assert.deepEqual(protectionOf('느시(들칠면조)'), bustard)
})

test('표의 모든 종은 제 국명으로 다시 찾힌다', () => {
  for (const p of PROTECTED) assert.equal(protectionOf(p.ko), p)
})

test('없는 이름은 null — 흔한 새, 빈 이름, 이름 미정, 비슷한 이름, 학명', () => {
  for (const ko of ['참새', '', '   ', '이름 미정', undefined, '큰부리큰기러기', '고니류', '까막딱', '새 매', 'Accipiter nisus', 'constructor']) {
    assert.equal(protectionOf(ko), null, String(ko))
  }
})

test('앞뒤 공백은 뗀다', () => {
  assert.equal(protectionOf('  새매 ')?.ko, '새매')
})

test('protectionLine: 법정 이름으로 한 줄, 표에 없으면 빈 글자', () => {
  assert.equal(protectionLine('새매'), '멸종위기 야생생물 Ⅱ급 · 천연기념물')
  assert.equal(protectionLine('넓적부리도요'), '멸종위기 야생생물 Ⅰ급')
  assert.equal(protectionLine('솔개'), '멸종위기 야생생물 Ⅱ급')
  assert.equal(protectionLine('황조롱이'), '천연기념물')
  assert.equal(protectionLine('참새'), '')
  assert.equal(protectionLine(''), '')
})

test('hideHint: 보호종이면 지위와 권하는 말, 아니면 빈 글자', () => {
  assert.equal(hideHint('솔개'), '멸종위기 야생생물 Ⅱ급입니다. 둥지·번식지에서 찍었다면 위치 숨기기를 권합니다.')
  assert.equal(hideHint('원앙'), '천연기념물입니다. 둥지·번식지에서 찍었다면 위치 숨기기를 권합니다.')
  assert.equal(hideHint('참새'), '')
  assert.equal(hideHint(undefined), '')
})
