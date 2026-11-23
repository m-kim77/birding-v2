import type { DetectBox } from '../../types'
import type { Detector } from '../detect/detector'

/**
 * 새 찾기 한 번을 돌리되, 그 사이 다른 사진의 탐지가 시작됐으면 결과·오류를 버리는 규칙 (useDetection이 쓴다).
 * 사진을 바로 바꾸면 옛 비트맵은 바꾸는 순간 닫혀, 옛 탐지가 닫힌 비트맵을 그리다 낸 영어 오류나 빈 결과가 새 사진의 것으로 보였다.
 * 이 파일은 타입만 import한다 (node --test가 읽는다 — test/detectLatest.test.ts).
 */

/** 탐지 한 번이 결과를 쓰는 곳 (useDetection의 상태) */
export interface DetectSink {
  /** 모델 받기의 진행률 0~1 */
  progress(fraction: number): void
  /** 찾은 상자들 — 못 찾으면 빈 배열 */
  found(boxes: DetectBox[]): void
  /** 모델 준비나 탐지가 실패했다 — 한국어 안내 */
  failed(message: string): void
}

/**
 * 번호표 판을 만든다. 돌려준 함수를 부를 때마다 새 번호를 뽑고, 그 번호가 아직 가장 나중 것인지 묻는 함수를 돌려준다 —
 * 뒤에 다른 번호를 뽑으면 앞 번호의 함수는 그 뒤로 늘 거짓이다.
 */
export function latestOnly(): () => () => boolean {
  let latest = 0
  return () => {
    const mine = ++latest
    return () => mine === latest
  }
}

/**
 * 모델을 준비하고(받아 둔 것을 읽어 탐지기를 만든다 — 처음 한 번 1~3초) 이 사진에서 새를 찾아 `sink`에 쓴다.
 * 준비가 끝났을 때·찾기가 끝났을 때·실패했을 때마다 `isLatest()`를 보고, 거짓이면 아무것도 쓰지 않고 끝난다 (실패해도 조용히).
 * 던지지 않는다 — 실패는 `sink.failed`로 간다 (Error가 아닌 것이 던져지면 '새를 찾지 못했습니다.').
 */
export async function detectIfLatest(
  detector: Pick<Detector, 'load' | 'detect'>, target: ImageBitmap, isLatest: () => boolean, sink: DetectSink,
): Promise<void> {
  try {
    await detector.load(sink.progress)
    if (!isLatest()) return
    const boxes = await detector.detect(target)
    if (isLatest()) sink.found(boxes)
  } catch (e) {
    if (!isLatest()) return
    sink.failed(e instanceof Error ? e.message : '새를 찾지 못했습니다.')
  }
}
