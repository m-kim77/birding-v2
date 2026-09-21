import { FilesetResolver, ObjectDetector } from '@mediapipe/tasks-vision'
import type { DetectBox } from '../../types'
import type { Detector } from './detector'
import { dropModel, fetchModel, isModelCached } from './modelCache'
import { fromTile, makeTiles, mergeBoxes } from './tiling'

/**
 * MediaPipe EfficientDet-Lite0 (Apache-2.0, COCO 80종 중 'bird'만 쓴다).
 * 고른 이유: 공식 웹 패키지가 있고 모델이 작다. 망원 사진의 작은 새는 조각 나누기(tiling.ts)로 보완한다.
 * 가중치는 repo에 넣지 않고 구글의 공개 저장소에서 받는다 — 오프라인(PWA)을 넣을 때 우리 저장소로 옮긴다.
 */
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite'
/**
 * wasm은 JS와 버전이 정확히 같아야 한다 (어긋나면 초기화에서 실패한다).
 * 그래서 버전을 손으로 적지 않고, 설치된 패키지의 버전을 빌드 때 넣는다 (vite.config.ts의 define).
 */
const WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${__MEDIAPIPE_VERSION__}/wasm`
const SCORE_MIN = 0.3
/** 가로로 긴 망원 사진 기준 3×2 조각, 20% 겹침 */
const TILES = makeTiles(3, 2, 0.2)
/** 조각 하나를 모델에 넣기 전의 긴 변. 모델이 어차피 320으로 줄이므로 크게 줄 필요가 없다 */
const TILE_EDGE = 640

let detector: ObjectDetector | null = null

/** 비트맵의 한 조각을 작은 캔버스로 옮긴다 */
function tileCanvas(bitmap: ImageBitmap, tile: (typeof TILES)[number]): HTMLCanvasElement {
  const sx = tile.x1 * bitmap.width, sy = tile.y1 * bitmap.height
  const sw = (tile.x2 - tile.x1) * bitmap.width, sh = (tile.y2 - tile.y1) * bitmap.height
  const scale = Math.min(1, TILE_EDGE / Math.max(sw, sh))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(sw * scale))
  canvas.height = Math.max(1, Math.round(sh * scale))
  canvas.getContext('2d')!.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
  return canvas
}

export const mediapipeDetector: Detector = {
  id: 'efficientdet_lite0',
  label: '새 찾기',
  sizeMb: 7,
  isCached: () => isModelCached(MODEL_URL),
  clearCache: async () => { detector?.close(); detector = null; await dropModel(MODEL_URL) },

  async load(onProgress) {
    if (detector) { onProgress(1); return }
    const model = await fetchModel(MODEL_URL, onProgress)
    try {
      const fileset = await FilesetResolver.forVisionTasks(WASM_BASE)
      detector = await ObjectDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetBuffer: model }, scoreThreshold: SCORE_MIN, categoryAllowlist: ['bird'], maxResults: 10,
      })
    } catch {
      throw new Error('새 찾기 모델을 준비하지 못했습니다. 인터넷 연결을 확인해 주세요.')
    }
  },

  async detect(bitmap): Promise<DetectBox[]> {
    if (!detector) throw new Error('새 찾기 모델이 아직 준비되지 않았습니다.')
    const found: DetectBox[] = []
    for (const tile of TILES) {
      const canvas = tileCanvas(bitmap, tile)
      for (const d of detector.detect(canvas).detections) {
        const b = d.boundingBox
        if (!b) continue
        const local: DetectBox = { score: d.categories[0]?.score ?? 0, x1: b.originX / canvas.width, y1: b.originY / canvas.height, x2: (b.originX + b.width) / canvas.width, y2: (b.originY + b.height) / canvas.height }
        found.push(fromTile(local, tile))
      }
    }
    return mergeBoxes(found)
  },
}
