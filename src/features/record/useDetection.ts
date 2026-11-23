import { useEffect, useState } from 'react'
import type { DetectBox } from '../../types'
import { mediapipeDetector as detector } from '../detect/mediapipeDetector'
import { detectIfLatest, latestOnly } from './detectLatest'

/** checking: 받아 둔 모델이 있는지 보는 중 · missing: 없음(받을지 물어야 함) · ready: 쓸 수 있음 */
export type ModelState = 'checking' | 'missing' | 'downloading' | 'ready'

/**
 * 새 찾기. 모델이 이 기기에 있으면 사진이 들어오자마자 자동으로 돈다 (기기 안에서 도는 공짜 작업이라 버튼이 없다).
 * 없으면 `missing`으로 두고 사용자가 받기를 누를 때까지 기다린다 — 수 MB를 말없이 받지 않는다.
 * 모델 준비나 탐지가 실패하면 `error`에 안내를 담고 boxes를 빈 배열로 둔다 — 직접 자르기로 계속할 수 있어야 한다.
 * 사진을 바로 바꾸면 옛 사진의 탐지는 결과·오류를 버린다 (탐지마다 번호를 매겨 가장 나중 것만 쓴다 — detectLatest.ts).
 */
export function useDetection(bitmap: ImageBitmap | null) {
  const [model, setModel] = useState<ModelState>('checking')
  const [download, setDownload] = useState(0)
  /** null이면 아직 찾는 중(또는 시작 전), 빈 배열이면 못 찾음 */
  const [boxes, setBoxes] = useState<DetectBox[] | null>(null)
  const [error, setError] = useState('')
  // 탐지마다 번호를 뽑는다. 가장 나중 번호가 아닌 탐지는 끝나도 결과·오류를 쓰지 않는다
  const [nextRun] = useState(latestOnly)

  useEffect(() => { void detector.isCached().then((has) => setModel(has ? 'ready' : 'missing')) }, [])

  /**
   * 이 사진에서 새를 찾는다 (모델 준비 포함 — detectLatest.ts detectIfLatest). 그 사이 다른 사진의 탐지가 시작됐으면 아무것도 쓰지 않는다.
   * 실패하면 안내를 담고 boxes를 빈 배열로 둔다.
   */
  async function run(target: ImageBitmap) {
    const isLatest = nextRun()
    setBoxes(null)
    setError('')
    await detectIfLatest(detector, target, isLatest, {
      progress: setDownload,
      found: setBoxes,
      failed: (message) => { setError(message); setBoxes([]) },
    })
  }

  // 모델이 준비돼 있으면 사진이 바뀔 때마다 돌린다. 받기를 마쳐 'ready'가 된 때에도 그때의 사진으로 한 번 돈다 —
  // 받는 동안 사진을 바꿨어도 지금 사진을 찾는다 (받기 자체는 탐지를 하지 않아 두 번 돌지 않는다)
  useEffect(() => { if (bitmap && model === 'ready') void run(bitmap) }, [bitmap, model]) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * 사용자가 "받기"를 눌렀다 — 모델만 받는다. 다 받으면 'ready'가 되어 위의 effect가 지금 사진에서 찾는다.
   * 실패하면 안내를 담고 다시 받을 수 있게 'missing'으로 돌린다. 이미 받는 중이면 아무것도 하지 않는다.
   */
  async function downloadModel() {
    if (model === 'downloading') return
    setModel('downloading')
    setError('')
    try {
      await detector.load(setDownload)
      setModel('ready')
    } catch (e) {
      setError(e instanceof Error ? e.message : '새 찾기 모델을 받지 못했습니다.')
      setModel('missing')
    }
  }

  return { model, download, boxes, error, downloadModel: () => void downloadModel(), detectorId: detector.id, sizeMb: detector.sizeMb }
}
