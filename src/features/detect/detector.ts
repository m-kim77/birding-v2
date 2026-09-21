import type { DetectBox } from '../../types'

/**
 * 새 탐지 모델의 공통 모양. 화면은 이것만 안다 — 모델을 바꿀 때 화면을 건드리지 않는다.
 * 지금 쓰는 모델은 하나다 (mediapipeDetector.ts). 여러 모델을 나란히 비교하는 일은 v1의 detection_test가 맡는다.
 */
export interface Detector {
  /** 기록에 남기는 모델 id */
  id: string
  /** 사용자에게 보여 주는 이름과 받을 크기 */
  label: string
  sizeMb: number
  /** 모델 파일이 이미 이 기기에 있는지 (받기 동의를 다시 묻지 않으려고) */
  isCached(): Promise<boolean>
  /** 모델을 받아 준비한다. `onProgress`는 0~1. 네트워크가 없으면 한국어 Error */
  load(onProgress: (fraction: number) => void): Promise<void>
  /** 사진에서 새를 찾는다. 못 찾으면 빈 배열. `load` 전에 부르면 Error */
  detect(bitmap: ImageBitmap): Promise<DetectBox[]>
  /** 받아 둔 모델 파일을 지운다 (저장 공간 돌려받기) */
  clearCache(): Promise<void>
}
