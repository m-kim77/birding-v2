import type { CardStyle, CardTier, Sighting } from '../../types'
// 확장자를 적는 이유: node --test가 이 파일을 직접 읽는다
import { CARD_BASE } from './cardLook.ts'

/**
 * 카드의 색에 관한 결정은 이 파일에만 있다: 고를 수 있는 색, 기본색, 새 기록의 첫 스타일, 옛 기록의 색, 어두운 바탕에서 읽히는 색.
 * 옛 등급 이름 넷은 2026-09-22에 뺐다 — 새에 등급을 매기지 않는다. 색은 사진에서 뽑거나 사용자가 고른다.
 * DOM을 쓰지 않는다 (node --test로 검사한다).
 */

/** 추천 색 하나 */
export interface CardPreset {
  id: string
  /** 화면에 보이는 이름 */
  ko: string
  accent: string
}

/** 추천 색. 옛 등급의 네 색(돌·하늘·보라·금)을 그대로 품고 숲·청록·산호·크림을 더했다 */
export const CARD_PRESETS: CardPreset[] = [
  { id: 'moss', ko: '숲', accent: '#7FB77E' },
  { id: 'teal', ko: '청록', accent: '#3FB0A6' },
  { id: 'sky', ko: '하늘', accent: '#4D8BC8' },
  { id: 'violet', ko: '보라', accent: '#8B4FCC' },
  { id: 'gold', ko: '금', accent: '#E0B856' },
  { id: 'coral', ko: '산호', accent: '#E8846B' },
  { id: 'cream', ko: '크림', accent: '#E9DFBF' },
  { id: 'stone', ko: '돌', accent: '#9AA0A6' },
]

/** 색을 뽑지 못했을 때의 기본. 차분한 돌색, 빛 없음 */
export const DEFAULT_STYLE: CardStyle = { accent: '#9AA0A6', glow: false }

/** 새 기록의 첫 스타일: 사진에서 뽑은 색이 있으면 그 색(빛 없음), 없으면 기본. 늘 새 객체를 돌려준다 (기록에 그대로 들어간다) */
export function styleFromAccent(accent: string | null): CardStyle {
  return accent && isHexColor(accent) ? { accent: accent.toUpperCase(), glow: false } : { ...DEFAULT_STYLE }
}

/** 옛 등급의 색·빛. 옛 기록의 카드 모양이 말없이 바뀌지 않도록 그대로 둔다 */
const LEGACY: Record<CardTier, CardStyle> = {
  1: { accent: '#9AA0A6', glow: false },
  2: { accent: '#4D8BC8', glow: true },
  3: { accent: '#8B4FCC', glow: true },
  4: { accent: '#E0B856', glow: true },
}

/** '#RRGGBB' 모양인지 */
export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
}

/**
 * 기록의 카드 스타일. `cardStyle`이 있고 색이 온전하면 그것, 없으면 옛 `tier`의 색, 그것도 이상하면 기본.
 * 백업에서 온 값은 믿지 않는다 — 깨진 색 문자열이 CSS에 들어가면 카드가 투명해진다.
 */
export function styleOf(s: Pick<Sighting, 'cardStyle' | 'tier'>): CardStyle {
  if (s.cardStyle && isHexColor(s.cardStyle.accent)) return { accent: s.cardStyle.accent.toUpperCase(), glow: s.cardStyle.glow === true }
  return LEGACY[s.tier] ?? DEFAULT_STYLE
}

/** '#RRGGBB' → [r, g, b] (0~255). 입력은 isHexColor를 통과한 값이어야 한다 — 아니면 NaN이 섞여 나온다 (검사는 부르는 쪽) */
export function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
}

/** [r, g, b] → '#RRGGBB' (대문자). 범위를 벗어난 값은 잘라 넣는다 */
export function rgbToHex([r, g, b]: [number, number, number]): string {
  const two = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0')
  return `#${two(r)}${two(g)}${two(b)}`.toUpperCase()
}

/** WCAG 상대 휘도 */
function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** 두 색('#RRGGBB')의 대비 (1~21). 형식이 틀리면 NaN — 그러면 readableAccent의 비교가 거짓이 되어 색을 손대지 않는다 */
export function contrastRatio(a: string, b: string): number {
  const [la, lb] = [luminance(hexToRgb(a)), luminance(hexToRgb(b))]
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** 강조색이 카드 바탕에서 읽히려면 이만큼은 돼야 한다 (굵은 글자·테두리 기준) */
export const MIN_ACCENT_CONTRAST = 3

/**
 * 어두운 카드 바탕(`CARD_BASE.bgBottom`)에서 읽히는 강조색을 돌려준다.
 * 대비가 모자라면 색상은 두고 밝기만 올린다 — 검정을 고르면 회색이 되고, 짙은 남색은 밝은 남색이 된다. 이미 충분하면 그대로.
 * 형식이 틀리면 기본색.
 */
export function readableAccent(hex: string): string {
  if (!isHexColor(hex)) return DEFAULT_STYLE.accent
  let rgb = hexToRgb(hex)
  for (let i = 0; i < 40 && contrastRatio(rgbToHex(rgb), CARD_BASE.bgBottom) < MIN_ACCENT_CONTRAST; i++) {
    // 흰색 쪽으로 8%씩 섞는다 — 색조는 남고 밝기만 오른다
    rgb = rgb.map((c) => c + (255 - c) * 0.08) as [number, number, number]
  }
  return rgbToHex(rgb)
}
