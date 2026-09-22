/**
 * 카드의 모양을 정하는 값. 사용자의 Card Reveal 디자인(`ref_design/Card Reveal.html`, "CreatureDex")에서 가져왔다:
 * 어두운 숲 바탕, 크림색 글자, 강조색 하나, 고정폭 글꼴의 작은 대문자 라벨.
 * (그 HTML은 껍데기만 있고 카드 본체 파일 creature-card.jsx·styles.css가 없어서, 카드 안의 배치는 그 단서들로 다시 짠 것이다.)
 *
 * 강조색은 기록마다 다르다 — 사진에서 뽑거나 사용자가 고른다 (cardStyle.ts). 여기에는 모든 카드가 함께 쓰는 값만 있다.
 * **화면의 카드(BirdCard + card.css)와 내보내는 카드(cardCanvas.ts)가 이 값을 함께 쓴다.** 앱 테마와는 무관하다.
 */

/** 모든 카드가 함께 쓰는 색 */
export const CARD_BASE = {
  /** 카드 바탕 (위 → 아래) */
  bgTop: '#18221C', bgBottom: '#0B100D',
  ink: '#F5F1E8', sub: 'rgba(245,241,232,0.62)', hair: 'rgba(245,241,232,0.16)',
  /** 카드가 놓이는 무대 (가운데 → 가장자리) */
  stageIn: '#1F2A24', stageMid: '#0A0E0C', stageOut: '#050605',
}

/** 글꼴. index.html이 받는 것만 쓴다 (Noto Serif KR · Instrument Serif · JetBrains Mono · Pretendard) */
export const CARD_FONTS = {
  name: "'Noto Serif KR', 'AppleMyungjo', serif",
  latin: "'Instrument Serif', 'Noto Serif KR', Georgia, serif",
  mono: "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace",
  body: "'Pretendard', -apple-system, 'Apple SD Gothic Neo', sans-serif",
}

/** 카드 오른쪽 위의 라벨. 등급 이름이 있던 자리 — 카드의 종류를 적는다 (뒷면의 글자와 같다) */
export const CARD_MARK = 'FIELD CARD'
