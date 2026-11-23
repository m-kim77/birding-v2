/**
 * 요청이 이 사이트의 화면에서 왔는지 보는 검사. 순수 함수다 (`test/origin.test.ts`).
 * 다른 사이트의 스크립트·폼·`<img>`가 방문자의 브라우저를 빌려 우리 함수를 부르는 길을 막는다 —
 * 응답은 못 읽어도 맥의 LLM·Nominatim·함수 시간을 남의 방문자 수만큼 쓰게 할 수 있다.
 * curl 같은 도구는 머리말을 마음대로 적으므로 이 검사로 못 막는다 (그건 요청 수 제한과 전체 상한이 맡는다).
 */

/**
 * 같은 사이트에서 온 요청인지 — Origin 머리말이 이 함수의 주소(프로토콜·호스트·포트)와 같은지.
 * 브라우저는 GET·HEAD가 아닌 요청에는 같은 사이트여도 Origin을 붙인다. Origin이 없는 요청(오래된 브라우저 등)도 거절한다.
 * 개발 서버(`dev/apiPlugin.ts`)는 브라우저가 연 주소로 요청을 만들어 그대로 맞는다.
 */
export function sameOrigin(request: Request): boolean {
  return request.headers.get('origin') === new URL(request.url).origin
}

/**
 * 다른 사이트가 시킨 요청인지 — GET처럼 Origin이 붙지 않는 요청에 쓴다.
 * 브라우저가 적는 `sec-fetch-site`가 있고 'same-origin'이 아니면 true(주소창에 직접 친 'none'도 막는다 — 앱은 그렇게 부르지 않는다).
 * 머리말이 없으면(curl·이 머리말을 모르는 오래된 브라우저) false — 앱을 쓰는 오래된 폰을 막지 않으려는 것이다.
 */
export function crossSiteFetch(request: Request): boolean {
  const site = request.headers.get('sec-fetch-site')
  return site !== null && site !== 'same-origin'
}
