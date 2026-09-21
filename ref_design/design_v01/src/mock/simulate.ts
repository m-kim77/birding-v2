/**
 * 시간이 걸리는 작업(모델 다운로드, AI 판정, 소리 분석)을 타이머로 흉내 낸다.
 * 실제 추론은 하지 않는다 — 진행 상태 화면의 모양을 보려는 것이다.
 */

/**
 * `total`단계를 `stepMs` 간격으로 하나씩 진행시키고, 단계가 바뀔 때마다 `onStep`을 부른다.
 * 돌려주는 함수를 부르면 즉시 멈춘다 (화면을 떠나거나 "중단"을 누를 때). 멈춘 뒤에는 `onStep`이 불리지 않는다.
 */
export function runSteps(total: number, stepMs: number, onStep: (done: number) => void): () => void {
  let done = 0
  const timer = window.setInterval(() => {
    done += 1
    onStep(done)
    if (done >= total) window.clearInterval(timer)
  }, stepMs)
  return () => window.clearInterval(timer)
}
