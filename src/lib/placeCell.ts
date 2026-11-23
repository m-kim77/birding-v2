/**
 * 장소 이름을 묻는 좌표의 칸 — 소수 3자리(약 110m)로 뭉갠다.
 * 브라우저(lib/place.ts)는 이 칸의 주소로만 묻고, 서버(api/place.ts)는 주소가 이 모양 그대로일 때만 모든 사용자가 함께 쓰는 CDN 캐시에 둔다.
 * 왜 110m인가: 그 공유 캐시는 같은 주소를 불러 보기만 해도 '최근 하루 안에 누군가 이 칸을 찾았는지'가 드러난다 (점검 2-4).
 * 4자리(약 11m)면 그 칸이 곧 사람이 서 있던 자리라 되돌리지 말 것. 공유 캐시는 Nominatim 이용 정책(모든 사용자 합계 초당 1회) 때문에 남긴다.
 * api/가 부르는 파일이라 import를 두지 않는다 (CLAUDE.md).
 */

/** 칸 하나. `key`는 브라우저의 기억 키, `query`는 `/api/place?` 뒤에 붙는 글자 */
export interface PlaceCell {
  lat: string
  lng: string
  key: string
  query: string
}

/**
 * 좌표가 든 칸. 같은 칸의 좌표는 늘 같은 글자를 준다 (toFixed — 반올림).
 * 숫자가 아닌 값(NaN·Infinity)도 던지지 않고 그 글자('NaN' 등)를 준다 — 걸러 내는 것은 부르는 쪽 몫이다.
 */
export function placeCell(lat: number, lng: number): PlaceCell {
  const la = lat.toFixed(3)
  const ln = lng.toFixed(3)
  return { lat: la, lng: ln, key: `${la},${ln}`, query: `lat=${la}&lng=${ln}` }
}
