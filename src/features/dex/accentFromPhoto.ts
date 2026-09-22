// 확장자를 적는 이유: node --test가 이 파일을 직접 읽는다
import { readableAccent, rgbToHex } from './cardStyle.ts'

/**
 * 사진에서 카드 강조색을 뽑는다. 저장할 때 한 번 돌려 `cardStyle.accent`에 넣는다 — 사용자가 아무것도 안 해도 카드마다 색이 다르다.
 * `dominantAccent`는 순수 함수(픽셀 배열 → 색)라 node --test로 검사하고, 캔버스에서 픽셀을 읽는 `accentFromImage`만 DOM을 쓴다.
 */

/** 표본으로 줄일 크기. 색만 볼 것이라 이 정도면 충분하고, 어떤 사진이든 같은 시간이 든다 */
const SAMPLE = 48
/** 색조 칸 수 (360°를 이만큼 나눈다). 칸 경계를 반 칸 밀어 빨강(0°/360°)이 두 칸으로 갈리지 않게 한다 */
const HUE_BINS = 24
/** 이보다 채도가 낮으면 "회색"으로 본다 */
const VIVID_MIN_SAT = 0.28
/** 선명한 픽셀 전체가 표본의 이 비율은 돼야 "선명한 색이 있다"고 본다 — 배경의 한 점을 새의 색으로 오해하지 않게 */
const VIVID_MIN_SHARE = 0.04
/** 회색 새(참새·직박구리)의 평균색을 이만큼은 물들인다 — 아주 채도 없는 색은 카드에서 죽는다 */
const MUTED_SAT_FLOOR = 0.38
/**
 * 평균색의 채도가 이보다 낮으면 색조를 믿지 않는다. rgbToHsl은 무채색에서 h=0(빨강)을 자리표로 돌려주고, 거의 무채색이면
 * 채널 1~2단계 차이로 색조가 180° 갈린다 — 그 색조를 물들이면 흑백 사진이 빨간 카드가 된다. 채도에 비례해 덜 물들인다
 */
const HUE_TRUST_SAT = 0.06

/** [r,g,b] 0~255 → [h(0~360), s(0~1), l(0~1)] */
export function rgbToHsl([r, g, b]: [number, number, number]): [number, number, number] {
  const [rr, gg, bb] = [r / 255, g / 255, b / 255]
  const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === rr ? ((gg - bb) / d + (gg < bb ? 6 : 0)) : max === gg ? (bb - rr) / d + 2 : (rr - gg) / d + 4
  return [h * 60, s, l]
}

/** [h,s,l] → [r,g,b] 0~255 */
export function hslToRgb([h, s, l]: [number, number, number]): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const sector = Math.floor((((h % 360) + 360) % 360) / 60)
  const [r1, g1, b1] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][sector] ?? [0, 0, 0]
  return [(r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255]
}

/**
 * 픽셀 배열(RGBA, 4바이트씩)에서 대표 강조색을 고른다. 픽셀이 없거나 전부 너무 어둡거나 밝으면 null.
 * 1) 너무 어둡거나(그림자) 너무 밝은(하늘·역광) 픽셀은 뺀다.
 * 2) 선명한 픽셀이 표본의 4% 이상이면, 채도 가중치가 가장 큰 색조 칸의 평균색 — 물총새의 청록, 딱새의 주황.
 * 3) 아니면 남은 픽셀 전체의 평균색을 물들인다 — 갈색·회색 새도 카드에 제 색이 든다. 단 색조를 믿을 만큼 색이 있을 때만
 *    (HUE_TRUST_SAT): 흑백 사진은 그 밝기의 무채색이 된다.
 * 어느 쪽이든 마지막에 어두운 바탕에서 읽히도록 밝기를 맞춘다 (readableAccent).
 */
export function dominantAccent(pixels: Uint8ClampedArray | Uint8Array): string | null {
  const bins = Array.from({ length: HUE_BINS }, () => ({ weight: 0, r: 0, g: 0, b: 0, n: 0 }))
  const sum = { r: 0, g: 0, b: 0 }
  let kept = 0
  let vivid = 0
  const binSize = 360 / HUE_BINS
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue
    const rgb: [number, number, number] = [pixels[i], pixels[i + 1], pixels[i + 2]]
    const [h, s, l] = rgbToHsl(rgb)
    if (l < 0.12 || l > 0.92) continue
    kept++
    sum.r += rgb[0]; sum.g += rgb[1]; sum.b += rgb[2]
    if (s >= VIVID_MIN_SAT) {
      vivid++
      const bin = bins[Math.floor(((h + binSize / 2) % 360) / binSize)]
      bin.weight += s; bin.r += rgb[0]; bin.g += rgb[1]; bin.b += rgb[2]; bin.n++
    }
  }
  if (kept === 0) return null
  if (vivid >= kept * VIVID_MIN_SHARE) {
    const top = bins.reduce((a, b) => (b.weight > a.weight ? b : a))
    return readableAccent(rgbToHex([top.r / top.n, top.g / top.n, top.b / top.n]))
  }
  const [h, s, l] = rgbToHsl([sum.r / kept, sum.g / kept, sum.b / kept])
  const tinted = Math.max(s, MUTED_SAT_FLOOR * Math.min(1, s / HUE_TRUST_SAT))
  return readableAccent(rgbToHex(hslToRgb([h, tinted, l])))
}

/**
 * 사진(잘라낸 판이나 비트맵)에서 강조색을 뽑는다. 작은 캔버스에 줄여 그린 뒤 픽셀을 읽는다.
 * 캔버스를 못 쓰거나 그리다 실패하면 null — 색을 못 뽑아도 저장은 막지 않는다.
 */
export async function accentFromImage(source: Blob | ImageBitmap): Promise<string | null> {
  let bitmap: ImageBitmap | null = null
  try {
    bitmap = source instanceof Blob ? await createImageBitmap(source) : source
    const canvas = document.createElement('canvas')
    canvas.width = SAMPLE
    canvas.height = SAMPLE
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(bitmap, 0, 0, SAMPLE, SAMPLE)
    return dominantAccent(ctx.getImageData(0, 0, SAMPLE, SAMPLE).data)
  } catch {
    return null
  } finally {
    if (source instanceof Blob) bitmap?.close()
  }
}
