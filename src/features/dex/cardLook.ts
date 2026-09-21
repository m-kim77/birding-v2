import type { CardTier } from '../../types'

/**
 * 카드의 모양을 정하는 값. 사용자의 Card Reveal 디자인(`ref_design/Card Reveal.html`, "CreatureDex")에서 가져왔다:
 * 어두운 숲 바탕, 크림색 글자, 등급마다 한 가지 강조색, 고정폭 글꼴의 작은 대문자 라벨.
 * (그 HTML은 껍데기만 있고 카드 본체 파일 creature-card.jsx·styles.css가 없어서, 카드 안의 배치는 그 단서들로 다시 짠 것이다.)
 *
 * **화면의 카드(BirdCard + card.css)와 내보내는 카드(cardCanvas.ts)가 이 값을 함께 쓴다.** 앱 테마와는 무관하다.
 */
export interface CardLook {
  /** 등급의 강조색 — 테두리·별·등급 라벨·빛 */
  accent: string
  /** 디자인의 등급 이름 */
  en: string
  ko: string
  /** 별 개수 (디자인의 예시가 1·3·4·5였다) */
  stars: number
  /** 빛 줄기와 바깥 빛을 쓸지. 일반 등급은 차분하게 둔다 */
  glow: boolean
}

export const CARD_LOOKS: Record<CardTier, CardLook> = {
  1: { accent: '#9AA0A6', en: 'COMMON', ko: '일반', stars: 1, glow: false },
  2: { accent: '#4D8BC8', en: 'RARE', ko: '희귀', stars: 3, glow: true },
  3: { accent: '#8B4FCC', en: 'EPIC', ko: '에픽', stars: 4, glow: true },
  4: { accent: '#E0B856', en: 'LEGENDARY', ko: '전설', stars: 5, glow: true },
}

/** 모든 등급이 함께 쓰는 색 */
export const CARD_BASE = {
  /** 카드 바탕 (위 → 아래) */
  bgTop: '#18221C', bgBottom: '#0B100D',
  ink: '#F5F1E8', sub: 'rgba(245,241,232,0.62)', hair: 'rgba(245,241,232,0.16)',
  /** 카드가 놓이는 무대 (가운데 → 가장자리) */
  stageIn: '#1F2A24', stageMid: '#0A0E0C', stageOut: '#050605',
}

export const CARD_FONTS = {
  name: "'Noto Serif KR', 'AppleMyungjo', serif",
  latin: "'Instrument Serif', 'Noto Serif KR', Georgia, serif",
  mono: "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace",
}

export const MAX_STARS = 5
