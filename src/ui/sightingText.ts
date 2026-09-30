/**
 * 여러 화면이 같이 쓰는 기록 문구 한 곳 (작업 35) — 같은 말을 화면마다 따로 적으면 하나만 고쳐져 어긋난다.
 * 한 화면에서만 쓰는 문구는 그 화면의 JSX에, 한 기능만 쓰는 문구는 그 폴더의 *Text.ts(cardText·storageText 등)에 둔다.
 * 순수 함수이고 타입만 import한다 — 첫 화면 묶음(일지·상세)이 부르므로 가볍게 둔다. node --test가 직접 읽는다.
 */
import type { LocationSource } from '../types'

/** 이름을 아직 못 붙인 기록의 이름 자리 — 일지·상세·지도·저장 공간·판정 결과·카드, 일지의 "이름 미정 N건" 칩이 같은 말을 쓴다 */
export const UNNAMED = '이름 미정'

/**
 * 기록의 이름 자리에 보일 말 — 이름이 비어 있으면(빈 글자·없음) '이름 미정', 있으면 그대로.
 * 공백만 든 이름을 따로 가리지 않는다 — 저장할 때 이미 앞뒤 공백을 떼어 들어온다 (record/nameFields.ts).
 */
export function nameText(speciesKo: string | undefined): string {
  return speciesKo || UNNAMED
}

/**
 * 위치 한 줄 — 장소 이름, 이름이 없으면 좌표(소수 4자리 ≈ 11m), 좌표도 없으면 '위치 없음'.
 * 기록 화면·수정 칸의 위치 줄(record/RecordFacts PlaceRow), 기록 상세, 위치 시트의 "지금: …"이 같이 쓴다.
 * 좌표 표기를 lib/format.ts formatCoords('…°N')로 바꾸지 않는다 — 보이는 글자가 바뀐다. 위도가 있으면 경도도 있다고 본다 (위치는 둘이 같이 정해진다).
 */
export function placeText(p: { name: string; lat: number | null; lng: number | null }): string {
  return p.name || (p.lat !== null ? `${p.lat.toFixed(4)}, ${p.lng!.toFixed(4)}` : '위치 없음')
}

/** 위치 출처마다의 말. 위치가 없을 때('none')의 말은 부르는 쪽이 정한다 (sourceText의 둘째 인자) */
const SOURCE_TEXT: Record<Exclude<LocationSource, 'none'>, string> = {
  exif: '사진 정보에서', tracklog: '이동 기록으로 추정', gps: '기록할 때의 현재 위치', manual: '지도에서 직접 고름',
}

/**
 * 위치가 어디서 왔는지 사용자에게 보여 주는 말. 위치가 없을 때의 말(`none`)은 부르는 쪽이 준다 —
 * 누를 수 있는 위치 줄(기록 화면·수정 칸)은 '위치 없음 — 눌러서 고르기', 읽기만 하는 기록 상세는 기본값 빈 글자라 줄 아래에 아무것도 붙지 않는다.
 * 두 말을 하나로 맞추지 않는다 — 상세의 위치 줄은 누를 수 없어 '눌러서 고르기'가 거짓이 된다.
 */
export function sourceText(source: LocationSource, none = ''): string {
  return source === 'none' ? none : SOURCE_TEXT[source]
}
