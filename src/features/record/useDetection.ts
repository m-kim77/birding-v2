import { useEffect, useState } from 'react'
import type { DetectBox } from '../../types'
import { mediapipeDetector as detector } from '../detect/mediapipeDetector'

/** checking: 받아 둔 모델이 있는지 보는 중 · missing: 없음(받을지 물어야 함) · ready: 쓸 수 있음 */
export type ModelState = 'checking' | 'missing' | 'downloading' | 'ready'

/**
 * 새 찾기. 모델이 이 기기에 있으면 사진이 들어오자마자 자동으로 돈다 (기기 안에서 도는 공짜 작업이라 버튼이 없다).
 * 없으면 `missing`으로 두고 사용자가 받기를 누를 때까지 기다린다 — 수 MB를 말없이 받지 않는다.
 * 모델 준비나 탐지가 실패하면 `error`에 안내를 담고 boxes를 빈 배열로 둔다 — 직접 자르기로 계속할 수 있어야 한다.
 */
export function useDetection(bitmap: ImageBitmap | null) {
  const [model, setModel] = useState<ModelState>('checking')
  const [download, setDownload] = useState(0)
  /** null이면 아직 찾는 중(또는 시작 전), 빈 배열이면 못 찾음 */
  const [boxes, setBoxes] = useState<DetectBox[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => { void detector.isCached().then((has) => setModel(has ? 'ready' : 'missing')) }, [])

  /** 모델을 준비하고 지금 사진에서 새를 찾는다 */
  async function run(target: ImageBitmap) {
    setBoxes(null)
    setError('')
    try {
      await detector.load(setDownload)
      setModel('ready')
      setBoxes(await detector.detect(target))
    } catch (e) {
      setError(e instanceof Error ? e.message : '새를 찾지 못했습니다.')
      setModel((m) => (m === 'downloading' ? 'missing' : m))
      setBoxes([])
    }
  }

  // 사진이 바뀔 때마다, 모델이 이미 있으면 바로 돌린다. (model을 의존성에 넣으면 받기 직후 두 번 돈다)
  useEffect(() => { if (bitmap && model === 'ready') void run(bitmap) }, [bitmap]) // eslint-disable-line react-hooks/exhaustive-deps

  /** 사용자가 "받기"를 눌렀다 */
  function downloadModel() {
    if (!bitmap) return
    setModel('downloading')
    void run(bitmap)
  }

  return { model, download, boxes, error, downloadModel, detectorId: detector.id, sizeMb: detector.sizeMb }
}
