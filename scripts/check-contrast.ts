/**
 * 모든 테마의 글자·바탕 조합이 대비 기준을 넘는지 검사한다.
 * 테마를 더하거나 값을 고친 뒤 `npm run check`로 돌린다. 하나라도 못 넘으면 종료 코드 1.
 *
 * 반투명·그라데이션 바탕은 계산할 수 없어서 themes.ts의 `solid`에 적어 둔 단색을 쓴다.
 */
import { THEMES } from '../src/theme/themes.ts'

/** 본문 글자 기준 (WCAG AA) */
const TEXT_MIN = 4.5
/** 아이콘·탭처럼 글자가 아닌 요소 기준 */
const UI_MIN = 3

/** '#RRGGBB'를 0~1 선형 RGB로 바꾼다. 형식이 다르면 Error */
function toLinear(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) throw new Error(`단색 hex가 아님: ${hex} — 반투명 값은 solid에 단색으로 적어야 한다`)
  const n = parseInt(m[1], 16)
  const ch = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
  return [ch(n >> 16), ch((n >> 8) & 255), ch(n & 255)]
}

/** WCAG 상대 휘도 */
function luminance(hex: string): number {
  const [r, g, b] = toLinear(hex)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** 두 색의 대비 (1~21) */
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

let failed = 0
for (const theme of THEMES) {
  const t = theme.tokens
  const pairs: Array<[string, string, string, number]> = [
    ['text1 / 카드', t.text1, theme.solid.card, TEXT_MIN],
    ['text2 / 카드', t.text2, theme.solid.card, TEXT_MIN],
    ['text3 / 카드', t.text3, theme.solid.card, TEXT_MIN],
    ['text1 / 앱', t.text1, theme.solid.app, TEXT_MIN],
    ['text3 / 앱', t.text3, theme.solid.app, TEXT_MIN],
    ['onPrimary / primary', t.onPrimary, t.primary, TEXT_MIN],
    ['onAccent / accent', t.onAccent, t.accent, TEXT_MIN],
    ['ok / 카드', t.ok, theme.solid.card, TEXT_MIN],
    ['warn / 카드', t.warn, theme.solid.card, TEXT_MIN],
    ['err / 카드', t.err, theme.solid.card, TEXT_MIN],
    ['tabActive / 탭', t.tabActive, theme.solid.tab, UI_MIN],
    ['tabInactive / 탭', t.tabInactive, theme.solid.tab, TEXT_MIN],
  ]
  for (const [label, fg, bg, min] of pairs) {
    const ratio = contrast(fg, bg)
    if (ratio < min) {
      failed++
      console.log(`✗ ${theme.name.padEnd(4)} ${label.padEnd(22)} ${ratio.toFixed(2)} < ${min}  (${fg} on ${bg})`)
    }
  }
}
console.log(failed ? `\n대비 미달 ${failed}건` : `대비 검사 통과 — 테마 ${THEMES.length}개`)
process.exit(failed ? 1 : 0)
