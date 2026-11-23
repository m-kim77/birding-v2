import type { DetectBox } from '../../types'

/**
 * 새 탐지 모델의 공통 모양. 화면은 이것만 안다 — 모델을 바꿀 때 화면을 건드리지 않는다.
 * 지금 쓰는 모델은 하나다 (mediapipeDetector.ts). 여러 모델을 나란히 비교하는 일은 v1의 detection_test가 맡는다.
 */
export interface Detector {
  /** 기록에 남기는 모델 id */
  id: string
  /** 사용자에게 보여 주는 이름과 받을 크기 (모델과 그 실행 파일을 합친, 처음 받을 때 오가는 양) */
  label: string
  sizeMb: number
  /** 다 받아 두었을 때 이 기기에 차지하는 양(MB) — 실행 파일(wasm)은 풀린 채로 들어가 받는 양(sizeMb)보다 크다. 지우기로 돌려받는 양 */
  storedMb: number
  /**
   * 이 브라우저에서 돌 수 있는지 (wasm을 컴파일할 수 있는지). false면 받기·자동 찾기를 하지 않고 직접 자르기만 남긴다 —
   * 받아 둔 파일이 있어도 쓰지 못하니, 사진마다 준비를 다시 돌려 같은 실패를 띄우지 않으려고.
   */
  supported(): boolean
  /** 받을 파일(모델·실행 파일)이 모두 이 기기에 있는지 (받기 동의를 다시 묻지 않으려고). 하나라도 없으면 false */
  isCached(): Promise<boolean>
  /** 아직 받지 않은 양(MB). 0이면 다 받아 둠, 일부만 있으면 나머지 몫만 (받기 단추에 보이는 크기). Cache Storage를 못 쓰면 sizeMb */
  missingMb(): Promise<number>
  /** 모델을 받아 준비한다. `onProgress`는 0~1. 네트워크가 없으면 한국어 Error */
  load(onProgress: (fraction: number) => void): Promise<void>
  /** 사진에서 새를 찾는다. 못 찾으면 빈 배열. `load` 전에 부르면 Error */
  detect(bitmap: ImageBitmap): Promise<DetectBox[]>
  /** 받아 둔 모델·실행 파일을 지운다 (저장 공간 돌려받기) */
  clearCache(): Promise<void>
}
