import test from 'node:test'
import assert from 'node:assert/strict'
import { dominantAccent, hslToRgb, rgbToHsl } from '../src/features/dex/accentFromPhoto.ts'
import { contrastRatio, hexToRgb } from '../src/features/dex/cardStyle.ts'
import { CARD_BASE } from '../src/features/dex/cardLook.ts'

/** [r,g,b]를 n번 되풀이한 RGBA 배열 */
function pixels(...runs: Array<[number, number, number, number]>): Uint8ClampedArray {
  const out: number[] = []
  for (const [r, g, b, n] of runs) for (let i = 0; i < n; i++) out.push(r, g, b, 255)
  return new Uint8ClampedArray(out)
}

test('rgb ↔ hsl 왕복', () => {
  for (const rgb of [[230, 132, 107], [63, 176, 166], [154, 160, 166], [12, 200, 30]] as Array<[number, number, number]>) {
    const back = hslToRgb(rgbToHsl(rgb))
    back.forEach((v, i) => assert.ok(Math.abs(v - rgb[i]) < 1.5, `${rgb} → ${back}`))
  }
})

test('선명한 색이 충분하면 그 색조가 대표색이다 — 초록 배경 속 주황 새', () => {
  const px = pixels([90, 120, 70, 60], [230, 120, 40, 30])
  const hex = dominantAccent(px)!
  const [h] = rgbToHsl(hexToRgb(hex))
  // 초록(≈100°)이 더 많지만 채도 가중치가 낮아 주황(≈25°)이 이길 수도, 초록이 이길 수도 있다 — 둘 중 하나여야 하고 회색이면 안 된다
  assert.ok((h > 10 && h < 45) || (h > 80 && h < 130), `hue ${h}`)
  assert.ok(contrastRatio(hex, CARD_BASE.bgBottom) >= 3)
})

test('선명한 점이 아주 적으면(배경의 한 점) 무시하고 전체 평균으로 간다', () => {
  const px = pixels([120, 110, 100, 200], [0, 0, 255, 2])
  const hex = dominantAccent(px)!
  const [h] = rgbToHsl(hexToRgb(hex))
  assert.ok(!(h > 200 && h < 260), `파랑이 대표가 되면 안 된다: ${hex}`)
})

test('회색 새(채도 낮음)는 평균색에 채도를 조금 넣어 죽은 회색이 되지 않게 한다', () => {
  const px = pixels([120, 110, 100, 100])
  const hex = dominantAccent(px)!
  const [, s] = rgbToHsl(hexToRgb(hex))
  assert.ok(s >= 0.25, `채도 ${s}`)
  assert.ok(contrastRatio(hex, CARD_BASE.bgBottom) >= 3)
})

test('너무 어둡거나 밝은 픽셀만 있으면 null (그림자·역광)', () => {
  assert.equal(dominantAccent(pixels([5, 5, 5, 50], [250, 250, 250, 50])), null)
  assert.equal(dominantAccent(new Uint8ClampedArray(0)), null)
})

test('투명 픽셀은 세지 않는다', () => {
  const px = new Uint8ClampedArray([200, 50, 50, 0, 200, 50, 50, 0])
  assert.equal(dominantAccent(px), null)
})

test('흑백 사진은 무채색 카드가 된다 — 색조 자리표(h=0, 빨강)를 물들이지 않는다', () => {
  const hex = dominantAccent(pixels([120, 120, 120, 100]))!
  const [r, g, b] = hexToRgb(hex)
  assert.ok(Math.abs(r - g) <= 4 && Math.abs(g - b) <= 4, `무채색이어야 한다: ${hex}`)
  assert.ok(contrastRatio(hex, CARD_BASE.bgBottom) >= 3)
})

test('거의 무채색인 평균은 채널 한두 단계 차이로 색이 크게 갈리지 않는다', () => {
  const a = hexToRgb(dominantAccent(pixels([122, 120, 118, 100]))!)
  const b = hexToRgb(dominantAccent(pixels([118, 120, 122, 100]))!)
  const dist = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
  assert.ok(dist < 40, `두 결과가 너무 다르다: ${a} vs ${b}`)
})

test('빨강은 0°/360° 경계에서 두 칸으로 갈리지 않는다', () => {
  // 색조 358°와 2° 픽셀을 반씩 — 한 칸으로 모여야 4% 문턱을 함께 넘고 빨강이 나온다
  const px = pixels([200, 40, 46, 30], [200, 46, 40, 30], [120, 120, 120, 1000])
  const [h, s] = rgbToHsl(hexToRgb(dominantAccent(px)!))
  assert.ok((h < 15 || h > 345) && s > 0.3, `hue ${h} sat ${s}`)
})
