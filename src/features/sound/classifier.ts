/**
 * 새소리 판정 모델의 공통 모양. 화면은 이것만 안다 — 모델을 바꿀 때 화면을 건드리지 않는다 (`detect/detector.ts`와 같은 방식).
 * 지금 쓰는 판정기는 `soundModel.ts` 한 줄이 정한다. BirdNET 2.4 → 3.0처럼 바꿀 때는 이 모양을 따르는 파일을 만들고 그 줄만 바꾼다.
 *
 * **어댑터 파일은 가볍게 둔다.** 기록 화면·설정 묶음에도 들어가므로(들어가는 버튼·받은 모델 줄), 무거운 실행 코드(tfjs 등)는
 * `load()` 안에서 `import()`로 받는다 — 파일 맨 위에서 import하면 사진 기록만 하는 사람도 그 코드를 받는다.
 */

/** 3초 창 하나에 대한 모델의 답 한 줄 — 이름표 한 줄과 점수 */
export interface SoundGuess {
  /** 이름표의 학명 자리. 새가 아닌 줄은 'Engine'·'Human vocal'처럼 학명이 아닌 글이 온다 (거르는 곳: heard.ts isSpecies) */
  latin: string
  /** 이름표의 영어 이름 */
  en: string
  /** 이름표의 한국어 이름. 없으면 빈 문자열 — 영어 이름을 대신 넣지 않는다 */
  ko: string
  /** 0~1 */
  score: number
}

export interface SoundClassifier {
  /** 모델 id — 어느 모델의 답인지 추적하는 재료 */
  id: string
  /** 사용자에게 보여 주는 이름과 받을 크기 */
  label: string
  sizeMb: number
  /**
   * 시험용 가짜면 true. 화면이 그 사실을 알리고, 배포판에서는 들어가는 버튼을 숨긴다 (soundModel.ts soundEntryOn) —
   * 가짜 답을 진짜처럼 보여 주지 않으려고.
   */
  demo: boolean
  /** 모델 파일이 이미 이 기기에 있는지 (받기 동의를 다시 묻지 않으려고) */
  isCached(): Promise<boolean>
  /**
   * 모델을 받아 판정할 준비까지 마친다. `onProgress`는 받기의 0~1 — 1이 된 뒤 이 약속이 끝날 때까지가 '준비 중'이다
   * (진짜 모델은 첫 판정이 몇 초 걸려 빈 소리로 한 번 돌려 둔다). 네트워크가 없거나 이 브라우저에서 못 돌면 한국어 Error
   */
  load(onProgress: (fraction: number) => void): Promise<void>
  /**
   * 3초 창 하나(48kHz 한 채널, 144,000개)를 판정한다. 점수 높은 순. 아주 낮은 줄은 어댑터가 미리 버려도 된다 —
   * 보여 줄 하한과 새가 아닌 줄 거르기는 heard.ts가 한다. `load` 전에 부르면 Error
   */
  classify(samples: Float32Array): Promise<SoundGuess[]>
  /** 받아 둔 모델 파일을 지운다 (저장 공간 돌려받기) */
  clearCache(): Promise<void>
}
