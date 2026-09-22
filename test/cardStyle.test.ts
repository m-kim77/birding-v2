import test from 'node:test'
import assert from 'node:assert/strict'
import { CARD_PRESETS, DEFAULT_STYLE, MIN_ACCENT_CONTRAST, contrastRatio, isHexColor, readableAccent, styleOf } from '../src/features/dex/cardStyle.ts'
import { CARD_BASE } from '../src/features/dex/cardLook.ts'
import type { Sighting } from '../src/types.ts'

test('styleOf: cardStyle이 있으면 그것을 쓴다 (대문자로 정리, glow는 true일 때만)', () => {
  assert.deepEqual(styleOf({ tier: 1, cardStyle: { accent: '#3fb0a6', glow: true } } as Sighting), { accent: '#3FB0A6', glow: true })
  assert.deepEqual(styleOf({ tier: 3, cardStyle: { accent: '#3FB0A6', glow: undefined as unknown as boolean } } as Sighting), { accent: '#3FB0A6', glow: false })
})

test('styleOf: 옛 기록(cardStyle 없음)은 등급의 색을 그대로 — 모양이 말없이 바뀌지 않는다', () => {
  assert.deepEqual(styleOf({ tier: 1 } as Sighting), { accent: '#9AA0A6', glow: false })
  assert.deepEqual(styleOf({ tier: 2 } as Sighting), { accent: '#4D8BC8', glow: true })
  assert.deepEqual(styleOf({ tier: 3 } as Sighting), { accent: '#8B4FCC', glow: true })
  assert.deepEqual(styleOf({ tier: 4 } as Sighting), { accent: '#E0B856', glow: true })
})

test('styleOf: 깨진 색이나 없는 등급은 기본으로 (백업에서 온 값을 믿지 않는다)', () => {
  assert.deepEqual(styleOf({ tier: 2, cardStyle: { accent: 'red', glow: true } } as Sighting), { accent: '#4D8BC8', glow: true })
  assert.deepEqual(styleOf({ tier: 9 as 1, cardStyle: { accent: '#12', glow: true } } as Sighting), DEFAULT_STYLE)
  assert.deepEqual(styleOf({} as Sighting), DEFAULT_STYLE)
})

test('isHexColor: #RRGGBB만', () => {
  assert.equal(isHexColor('#A1b2C3'), true)
  assert.equal(isHexColor('#abc'), false)
  assert.equal(isHexColor('A1B2C3'), false)
  assert.equal(isHexColor(null), false)
})

test('readableAccent: 검정·짙은 색은 바탕과 3:1 이상이 되게 밝아지고, 이미 밝은 색은 그대로', () => {
  for (const dark of ['#000000', '#101820', '#0B100D', '#20104A']) {
    const out = readableAccent(dark)
    assert.ok(contrastRatio(out, CARD_BASE.bgBottom) >= MIN_ACCENT_CONTRAST, `${dark} → ${out}`)
  }
  assert.equal(readableAccent('#E0B856'), '#E0B856')
  assert.equal(readableAccent('nope'), DEFAULT_STYLE.accent)
})

test('추천 색은 전부 바탕에서 읽힌다', () => {
  for (const p of CARD_PRESETS) assert.ok(contrastRatio(p.accent, CARD_BASE.bgBottom) >= MIN_ACCENT_CONTRAST, p.ko)
})
