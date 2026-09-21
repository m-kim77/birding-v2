import type { DetectBox, NormalizedBox } from '../../types'

/**
 * 조각 나누기와 겹친 상자 정리. 순수 계산만 있다 (node --test로 검사한다).
 *
 * 왜 조각을 내나: 탐지 모델은 입력을 320px 안팎으로 줄여서 본다. 2,400만 화소 망원 사진에서 새는 작은 점이라
 * 통째로 줄이면 몇 픽셀만 남아 어떤 모델도 못 찾는다. 조각마다 따로 돌리면 새가 그만큼 크게 보인다.
 */

/** 원본 안의 조각 하나 (0~1 정규화) */
export interface Tile extends NormalizedBox {}

/**
 * 사진 전체 + `cols`×`rows` 격자 조각을 만든다. 조각끼리는 `overlap`(조각 크기 대비 비율)만큼 겹친다 —
 * 겹치지 않으면 경계에 걸친 새가 양쪽에서 다 잘린다.
 */
export function makeTiles(cols: number, rows: number, overlap: number): Tile[] {
  const tiles: Tile[] = [{ x1: 0, y1: 0, x2: 1, y2: 1 }]
  const w = 1 / (cols - (cols - 1) * overlap)
  const h = 1 / (rows - (rows - 1) * overlap)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x1 = c * w * (1 - overlap)
      const y1 = r * h * (1 - overlap)
      tiles.push({ x1, y1, x2: Math.min(1, x1 + w), y2: Math.min(1, y1 + h) })
    }
  }
  return tiles
}

/** 조각 안의 좌표(0~1)를 원본 좌표(0~1)로 되돌린다 */
export function fromTile(box: DetectBox, tile: Tile): DetectBox {
  const tw = tile.x2 - tile.x1
  const th = tile.y2 - tile.y1
  return { score: box.score, x1: tile.x1 + box.x1 * tw, y1: tile.y1 + box.y1 * th, x2: tile.x1 + box.x2 * tw, y2: tile.y1 + box.y2 * th }
}

/** 두 상자가 겹치는 정도 (교집합 / 합집합) */
export function iou(a: NormalizedBox, b: NormalizedBox): number {
  const w = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1))
  const h = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1))
  const inter = w * h
  const union = (a.x2 - a.x1) * (a.y2 - a.y1) + (b.x2 - b.x1) * (b.y2 - b.y1) - inter
  return union > 0 ? inter / union : 0
}

/** 작은 상자가 큰 상자 안에 얼마나 들어가 있나 (교집합 / 작은 쪽 넓이) */
function containment(a: NormalizedBox, b: NormalizedBox): number {
  const w = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1))
  const h = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1))
  const small = Math.min((a.x2 - a.x1) * (a.y2 - a.y1), (b.x2 - b.x1) * (b.y2 - b.y1))
  return small > 0 ? (w * h) / small : 0
}

/**
 * 같은 새를 가리키는 상자들을 하나로 줄인다 (점수 높은 것부터 남긴다).
 * IoU만 보면 "조각에서 잡힌 새의 절반"과 "전체에서 잡힌 새 한 마리"가 따로 남는다 —
 * 그래서 한쪽이 다른 쪽에 대부분 들어가 있는 경우도 같은 새로 본다.
 */
export function mergeBoxes(boxes: DetectBox[], iouAt = 0.5, insideAt = 0.8): DetectBox[] {
  const kept: DetectBox[] = []
  for (const box of [...boxes].sort((a, b) => b.score - a.score)) {
    if (!kept.some((k) => iou(k, box) >= iouAt || containment(k, box) >= insideAt)) kept.push(box)
  }
  return kept
}
