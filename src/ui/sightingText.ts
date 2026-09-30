/**
 * 여러 화면이 같이 쓰는 기록 문구 한 곳 (작업 35) — 같은 말을 화면마다 따로 적으면 하나만 고쳐져 어긋난다.
 * 한 화면에서만 쓰는 문구는 그 화면의 JSX에, 한 기능만 쓰는 문구는 그 폴더의 *Text.ts(cardText·storageText 등)에 둔다.
 * 순수 함수이고 import가 없다 — 첫 화면 묶음(일지·상세)이 부르므로 가볍게 둔다. node --test가 직접 읽는다.
 */

/** 이름을 아직 못 붙인 기록의 이름 자리 — 일지·상세·지도·저장 공간·판정 결과·카드, 일지의 "이름 미정 N건" 칩이 같은 말을 쓴다 */
export const UNNAMED = '이름 미정'

/**
 * 기록의 이름 자리에 보일 말 — 이름이 비어 있으면(빈 글자·없음) '이름 미정', 있으면 그대로.
 * 공백만 든 이름을 따로 가리지 않는다 — 저장할 때 이미 앞뒤 공백을 떼어 들어온다 (record/nameFields.ts).
 */
export function nameText(speciesKo: string | undefined): string {
  return speciesKo || UNNAMED
}
