/**
 * 오래 걸리는 준비(모델 받기·탐지기 만들기)를 여러 곳이 동시에 불러도 한 번만 돌게 하는 문.
 * 이 파일은 import가 없다 (node --test가 읽는다 — test/sharedTask.test.ts).
 */

/** 0~1의 진행률을 받는 곳 */
type Progress = (fraction: number) => void

/**
 * `prepare`를 감싼 함수를 돌려준다. 그 함수를 부르면 진행 중인 준비가 있으면 그것을 함께 기다리고, 없으면 새로 시작한다.
 * 진행률은 지금 기다리는 모두에게 간다 — 함께 기다리는 쪽의 막대도 움직인다. 기다림이 끝나면(성공·실패 모두) 그쪽의 진행률 받기를 지운다.
 * 준비가 실패하면 기다리던 모두가 같은 오류를 받고, 다음 부름은 새로 시작한다 (실패를 기억하지 않는다).
 * 성공도 기억하지 않는다 — 이미 다 됐는지는 부르는 쪽이 보고 부르지 않는다 (mediapipeDetector의 detector).
 */
export function shareInFlight(prepare: (report: Progress) => Promise<void>): (onProgress: Progress) => Promise<void> {
  let running: Promise<void> | null = null
  const listeners = new Set<Progress>()
  const report: Progress = (fraction) => { for (const listen of listeners) listen(fraction) }
  return async (onProgress) => {
    listeners.add(onProgress)
    running ??= prepare(report).finally(() => { running = null })
    try { await running } finally { listeners.delete(onProgress) }
  }
}
