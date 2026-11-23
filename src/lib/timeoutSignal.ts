/**
 * 정한 시간이 지나면 스스로 멈추는 신호 — fetch의 `signal`로 넘긴다.
 * `AbortSignal.timeout`은 사파리 16부터 있어서, iOS 15(아이폰 6s·7·SE 1세대의 마지막 판)에서 그대로 부르면 TypeError가 난다.
 * 그 오류가 fetch를 감싼 try에 잡히면 요청을 보내 보지도 않고 '닿지 못했습니다'가 된다 — 그래서 브라우저 코드는 이 함수를 쓴다.
 */

/**
 * `ms` 밀리초 뒤에 멈추는 신호를 돌려준다. `AbortSignal.timeout`이 있으면 그것을, 없으면 `fallbackTimeoutSignal`을 쓴다.
 * `ms`가 0 이하이면 거의 곧바로 멈춘다 (다음 타이머 차례). 던지지 않는다.
 */
export function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms)
  return fallbackTimeoutSignal(ms)
}

/**
 * `AbortController`와 `setTimeout`으로 같은 신호를 만든다. 멈출 때의 이유는 원래 함수처럼 이름이 'TimeoutError'인 DOMException이다
 * (iOS 15.0~15.3은 이유를 받지 않아 AbortError로 멈춘다 — 부르는 쪽은 어느 쪽이든 '시간 초과·중단'으로만 본다).
 * 타이머는 지우지 않는다 — 요청이 먼저 끝나도 이미 쓴 신호가 늦게 멈출 뿐 아무 일도 일어나지 않는다.
 */
export function fallbackTimeoutSignal(ms: number): AbortSignal {
  const ctrl = new AbortController()
  setTimeout(() => ctrl.abort(new DOMException('시간이 지나 요청을 멈췄습니다.', 'TimeoutError')), Math.max(0, ms))
  return ctrl.signal
}
