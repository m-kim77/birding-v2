// 확장자를 적는 이유: node --test가 이 파일을 직접 읽는다
import { formatShot } from '../../lib/format.ts'
// 확장자를 적는 이유: 위와 같다
import { nameText } from '../../ui/sightingText.ts'
// 확장자를 적는 이유: 위와 같다
import { dotDateOf } from '../../ui/when.ts'
import type { Sighting } from '../../types'
// 확장자를 적는 이유: 위와 같다
import { CARD_MARK } from './cardLook.ts'

/**
 * 카드에 적는 글자를 만든다. 화면의 카드(BirdCard)와 내보내는 카드(cardCanvas)가 같은 글자를 쓰도록 한 곳에 둔다.
 */

/** 도감 번호를 'No. 003' 모양으로. 번호가 없는 기록(이름 미정·옛 기록)은 'No. —' */
export function dexLabel(no: number | undefined): string {
  return `No. ${no ? String(no).padStart(3, '0') : '—'}`
}

/** 카드에 적는 이름. 이름이 비어 있으면(이름을 아직 못 붙인 기록) '이름 미정' — 일지·상세와 같은 말 (ui/sightingText.ts) */
export function cardName(s: Pick<Sighting, 'speciesKo'>): string {
  return nameText(s.speciesKo)
}

/**
 * 카드에 적는 장소. 위치를 숨긴 기록(`sensitive`)은 장소 대신 '위치 비공개' — 카드는 SNS로 퍼지는 물건이라, 화면 카드와 내보낸 카드가 이 한 곳을 같이 쓴다.
 * 숨기지 않은 기록은 장소를 그대로 돌려준다 (장소가 비어 있으면 빈 문자열 — 바꾸지 않는다).
 */
export function cardPlace(s: Pick<Sighting, 'sensitive' | 'place'>): string {
  return s.sensitive ? '위치 비공개' : s.place
}

/** 카드 맨 아래의 촬영 정보 한 줄 (대문자). 촬영 정보가 없으면 빈 문자열 */
export function shotLine(s: Sighting): string {
  return formatShot({ focal_length: s.shot.focalLength, f_number: s.shot.fNumber, exposure_time: s.shot.exposureTime, iso: s.shot.iso }).toUpperCase()
}

/** 카드 뒷면 가운데의 글. 영상에서 카드가 뒤집히기 전에 보인다 (cardCanvas.ts drawCardBack) */
export const CARD_BACK_TITLE = '탐조일지'

/** 내보내는 카드가 글꼴마다 그리는 글 (cardLook.ts CARD_FONTS의 이름마다). 그 글꼴로 그리는 것이 없으면 빈 문자열 */
export interface CardFontText {
  name: string
  latin: string
  mono: string
  body: string
}

/**
 * 내보내는 카드(cardCanvas.ts drawCardFront·drawCardBack)가 글꼴마다 실제로 그리는 글을 모은다 — 그 글꼴을 기다릴 때 넘긴다 (loadCardFonts).
 * 한글 글꼴(Pretendard 가변 동적 조각판 · Noto Serif KR)은 글자 묶음마다 파일이 따로라, 넘긴 글자가 든 묶음만 받고 기다린다 —
 * 빠뜨린 글자(예: 장소 줄)는 캔버스가 대체 글꼴로 그려 버린다. **카드에 그리는 글을 바꾸면 여기도 바꾼다.**
 */
export function cardFontText(s: Sighting, dexNo: number | undefined): CardFontText {
  return {
    name: `${cardName(s)} ${CARD_BACK_TITLE}`,
    latin: s.latin ?? '',
    mono: [dexLabel(dexNo).toUpperCase(), CARD_MARK, dotDateOf(s), shotLine(s), ...s.stamps].join(' '),
    body: cardPlace(s),
  }
}
