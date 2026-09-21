import type { CardTier } from '../../types'

/**
 * 등급별 카드의 색. **화면의 카드(BirdCard + card.css)와 내보내는 카드(cardCanvas.ts)가 이 값을 함께 쓴다** —
 * 색을 한 곳에만 두어 두 그림이 어긋나지 않게 한다. 앱 테마와는 무관하다 (카드는 어느 테마에서도 같다).
 */
export interface CardLook {
  /** 테두리 그라데이션의 색 정지점 (135도 방향, 균등 간격) */
  frame: string[]
  paper: string
  ink: string
  sub: string
  /** 등급 글자 색 */
  tierInk: string
  /** 빛 줄기가 지나가는 효과를 쓸지. 1단계는 차분하게 둔다 */
  shine: boolean
}

export const CARD_LOOKS: Record<CardTier, CardLook> = {
  1: { frame: ['#c3cdbd', '#aab6a4'], paper: '#fbfaf4', ink: '#1c2a22', sub: '#4b5b50', tierInk: '#4b5b50', shine: false },
  2: { frame: ['#dfe5e8', '#9aa7ae', '#eef2f4', '#8e9aa1'], paper: '#fbfaf4', ink: '#1c2a22', sub: '#4b5b50', tierInk: '#55626a', shine: true },
  3: { frame: ['#f3dc9a', '#b98a2c', '#fbedc0', '#a87a20'], paper: '#fbfaf4', ink: '#1c2a22', sub: '#4b5b50', tierInk: '#8a6210', shine: true },
  4: { frame: ['#f7e7b0', '#c9972f', '#fff4cf', '#b07f1d', '#f3dc9a'], paper: '#16241d', ink: '#f6efd8', sub: '#cdbf93', tierInk: '#f0cf73', shine: true },
}

/** 카드 뒷면 (영상의 첫 장면). 등급과 무관하게 하나다 */
export const CARD_BACK = { fill: '#19382f', ink: '#e9dfbf', line: '#c98a2e' }

/** 테두리 색 정지점을 CSS 그라데이션으로 만든다 */
export function frameCss(look: CardLook): string {
  return `linear-gradient(135deg, ${look.frame.join(', ')})`
}
