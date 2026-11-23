// 타입만 — 실행 코드(약 130kB)는 prepare 안에서 받는다. 맨 위에서 값을 import하면 이 파일을 부르는 곳(기록하기의 '+'·설정의 '받은 모델' 줄)이
// 모델이 없거나 받아 둔 표시만 볼 때도 그 코드를 받는다
import type { ObjectDetector } from '@mediapipe/tasks-vision'
import { browserChunkEnv } from '../../app/chunkEnv'
import { ChunkLoadError, loadChunk } from '../../app/chunkLoad'
import { shareInFlight } from '../../lib/sharedTask'
import type { DetectBox } from '../../types'
import type { Detector } from './detector'
import { dropModel, dropStale, fetchModel, isModelCached, partProgress, sumMissingMb } from './modelCache'
import { isVisionWasm, wasmFiles } from './mediapipeWasm'
import { canCompileWasm } from './wasmCompile'
import { fromTile, makeTiles, mergeBoxes } from './tiling'

/**
 * MediaPipe EfficientDet-Lite0 (Apache-2.0, COCO 80종 중 'bird'만 쓴다).
 * 고른 이유: 공식 웹 패키지가 있고 모델이 작다. 망원 사진의 작은 새는 조각 나누기(tiling.ts)로 보완한다.
 * 가중치는 repo에 넣지 않고 구글의 공개 저장소에서 받는다 — 오프라인(PWA)을 넣을 때 우리 저장소로 옮긴다.
 */
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite'
/**
 * 처음 받을 때 오가는 대략의 크기(MB). 모델은 압축 없이 약 7.3MB, wasm은 원본 약 11MB를 사이트(Vercel)가 br로 줄여 약 2.3MB (점검 5-9 실측).
 * 진행 막대를 이 비율로 나누고, 둘을 더한 것이 화면의 '받기 (…MB)'다.
 */
const MODEL_MB = 7.3
const WASM_MB = 2.3
/**
 * wasm의 풀린 크기(대략, 판마다 10.5~11.2MB) — 압축해 보내면 content-length로 진행률을 셀 수 없어 이 값으로 센다 (modelCache.ts progressTotal).
 * Cache Storage에도 풀린 채로 들어가, 기기에 차지하는 양은 모델과 합쳐 약 18MB다 (storedMb).
 */
const WASM_BYTES = 11_000_000
const SCORE_MIN = 0.3
/** 가로로 긴 망원 사진 기준 3×2 조각, 20% 겹침 */
const TILES = makeTiles(3, 2, 0.2)
/** 조각 하나를 모델에 넣기 전의 긴 변. 모델이 어차피 320으로 줄이므로 크게 줄 필요가 없다 */
const TILE_EDGE = 640

let detector: ObjectDetector | null = null

/** 실행 코드를 받지 못했거나 탐지기를 만들지 못했다 (오프라인·신호 약함 — wasm 컴파일이 막힌 브라우저는 받기 전에 UNSUPPORTED로 가른다) */
const PREPARE_FAILED = '새 찾기 모델을 준비하지 못했습니다. 인터넷 연결을 확인해 주세요.'
/** 이 브라우저가 wasm을 컴파일하지 못한다 (사파리 15 이하 — CSP의 'wasm-unsafe-eval'을 모른다, wasmCompile.ts). 인터넷 탓이 아니니 직접 자르기로 보낸다 */
const UNSUPPORTED = '이 브라우저에서는 새 찾기를 쓸 수 없습니다. 새가 있는 부분을 직접 잘라 주세요.'
/** 새로 배포되어 지금 열린 앱의 실행 코드 조각이 사이트에서 사라졌다 (404) — 인터넷은 멀쩡하니 연결을 확인하라고 하면 원인을 알 수 없다 */
const NEW_BUILD = '새 판이 나와서 지금 열린 앱으로는 새 찾기를 준비할 수 없습니다. 앱을 다시 열면 쓸 수 있습니다.'

let compiles: boolean | null = null

/** wasm을 컴파일할 수 있는지를 처음 한 번만 재고 기억한다 — 막힌 브라우저는 잴 때마다 콘솔에 CSP 위반이 한 줄씩 찍힌다 */
function supported(): boolean {
  compiles ??= canCompileWasm()
  return compiles
}

/**
 * 새 찾기 실행 코드(@mediapipe/tasks-vision) 조각을 받는다. 못 받으면 한 번 더 받아 보고, 그래도 안 되면 사이트에 새 판이 나왔는지 묻는다
 * (chunkLoad.ts loadChunk — 새로 고치지는 않는다: 기록하기에 쓰던 값이 있다). 새 판이면 NEW_BUILD, 아니면(묻지 못했거나 같은 판) PREPARE_FAILED의 Error.
 */
async function loadVision(): Promise<typeof import('@mediapipe/tasks-vision')> {
  try {
    return await loadChunk(() => import('@mediapipe/tasks-vision'), false, browserChunkEnv)
  } catch (e) {
    throw new Error(e instanceof ChunkLoadError && e.newBuild ? NEW_BUILD : PREPARE_FAILED)
  }
}

/**
 * 모델과 wasm을 받고(받아 둔 것이 있으면 기기에서 읽고) 탐지기를 만든다. 진행률은 `report`로 — 기다리는 모두에게 간다 (shareInFlight).
 * wasm은 Cache Storage에서 꺼낸 바이트를 blob 주소로 넘긴다 — 브라우저의 보통 캐시가 비어도 다시 받지 않고, '받아 둠'이면 정말 받아 둔 것이다 (점검 5-9).
 * 이 브라우저가 wasm을 컴파일하지 못하면 아무것도 받기 전에 UNSUPPORTED — 10MB를 받고 나서 실패하지 않게.
 * 받기가 실패하면 fetchModel의 한국어 Error, 실행 코드 조각을 못 받으면 loadVision의 한국어 Error(새 판이면 '앱을 다시 열면'),
 * 탐지기를 만들지 못하면(로더 js를 못 받음 등) PREPARE_FAILED. 어느 쪽이든 직접 자르기로 계속할 수 있다.
 */
async function prepare(report: (fraction: number) => void): Promise<void> {
  if (!supported()) throw new Error(UNSUPPORTED)
  const files = wasmFiles()
  const [toModel, toWasm] = partProgress([MODEL_MB, WASM_MB], report)
  const model = await fetchModel(MODEL_URL, toModel)
  const wasm = await fetchModel(files.binary, toWasm, WASM_BYTES)
  void dropStale(isVisionWasm, [files.binary])
  const { ObjectDetector } = await loadVision()
  // type이 application/wasm이어야 스트리밍 컴파일을 쓴다 (아니면 로더가 한 번 더 읽어 컴파일한다). 다 만들면 주소를 놓는다 — 로더는 그 전에 읽기를 마친다
  const binaryUrl = URL.createObjectURL(new Blob([wasm], { type: 'application/wasm' }))
  try {
    detector = await ObjectDetector.createFromOptions({ wasmLoaderPath: files.loader, wasmBinaryPath: binaryUrl }, {
      baseOptions: { modelAssetBuffer: model }, scoreThreshold: SCORE_MIN, categoryAllowlist: ['bird'], maxResults: 10,
    })
  } catch {
    throw new Error(PREPARE_FAILED)
  } finally {
    URL.revokeObjectURL(binaryUrl)
  }
}

/**
 * 진행 중인 준비 하나를 함께 기다린다 — 두 곳(사진을 바로 바꾼 기록 화면 · 설정의 받기)이 동시에 불러도 준비는 한 번이고 진행률은 모두에게 간다.
 * 따로 만들면 탐지기가 둘 생기고 하나는 닫히지 않은 채 버려진다 (wasm 메모리). 실패하면 다음 부름이 새로 준비한다.
 */
const prepareShared = shareInFlight(prepare)

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
  sizeMb: Math.round(MODEL_MB + WASM_MB),
  storedMb: Math.round(MODEL_MB + WASM_BYTES / 1_000_000),
  supported,
  isCached: () => isModelCached(MODEL_URL, wasmFiles().binary),
  // 파일마다 따로 본다 — 모델만 받아 둔 기기(점검 5-9 전 판)는 wasm 몫(약 2MB)만 받으면 된다
  missingMb: async () => sumMissingMb([[MODEL_MB, await isModelCached(MODEL_URL)], [WASM_MB, await isModelCached(wasmFiles().binary)]]),
  // wasm은 지금 판·옛 판 모두 지운다 (keep 없음)
  clearCache: async () => { detector?.close(); detector = null; await dropModel(MODEL_URL); await dropStale(isVisionWasm, []) },

  async load(onProgress) {
    if (detector) { onProgress(1); return }
    await prepareShared(onProgress)
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
