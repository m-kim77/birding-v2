/**
 * 화면 조각을 미리 받아 두는 규칙 — 첫 화면을 그리고 조금 뒤, 그때 온라인이면 한 번만 받는다.
 * 서비스 워커가 없어, 이 탭에서 받은 적 없는 조각은 신호 없는 곳에서 열 수 없다 (새로 배포한 날은 브라우저에 남은 옛 판도 이름이 달라 못 쓴다).
 * 첫 화면 묶음은 작게 둔 채(필요할 때 받기) 신호가 있을 때 미리 받아 두면, 산에서도 그 화면이 열린다.
 * 한 번만 받는 이유: 브라우저는 실패한 import()를 기억해 같은 탭에서 다시 받지 않는다 — 여러 번 해 봐야 소용이 없다.
 * 그래서 미리 받기가 실패하면 그 화면을 처음 열다 실패한 것과 같다 (그 자리에 안내가 뜨고, 앱을 다시 열면 낫는다).
 * 이 파일은 값을 import하지 않는다 (node --test가 읽는다 — test/prefetch.test.ts). 브라우저 값은 chunkEnv.ts browserPrefetchEnv가 넘긴다.
 */

/** 미리 받기가 브라우저에서 읽고 하는 것. 실제 값은 chunkEnv.ts browserPrefetchEnv, 시험은 가짜를 넘긴다 */
export interface PrefetchEnv {
  /** navigator.onLine — 거짓이면 받지 않는다 (받아 봐야 실패하고, 실패는 위처럼 남는다) */
  online(): boolean
  /** `run`을 나중에(첫 화면을 그리고 조금 뒤) 한 번 부른다. 돌려준 함수는 아직 부르지 않았으면 취소한다 */
  later(run: () => void): () => void
}

/**
 * `loads`(조각을 받는 함수 — lazyScreen·lazyPart에 넘긴 바로 그 함수)를 나중에 한 번씩 부른다. 그때 오프라인이면 아무것도 받지 않는다.
 * 같은 함수라 브라우저가 받아 둔 모듈을 화면을 열 때 그대로 쓴다 (다시 받지 않는다).
 * 받다 실패해도(신호 약함 · 그새 새 판이 나와 404) 조용히 넘긴다 — 그 화면을 열 때 lazyScreen이 그 자리에 안내한다.
 * 하나가 곧바로 던져도 나머지는 받는다. 돌려준 함수를 부르면 아직 시작하지 않은 미리 받기를 취소한다 (useEffect 정리).
 */
export function prefetchLater(loads: ReadonlyArray<() => Promise<unknown>>, env: PrefetchEnv): () => void {
  return env.later(() => {
    if (!env.online()) return
    for (const load of loads) void Promise.resolve().then(load).catch(() => {})
  })
}
