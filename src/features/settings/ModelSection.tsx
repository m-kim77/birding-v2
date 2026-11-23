import { useEffect, useState } from 'react'
import { Card } from '../../ui/bits'
import Button from '../../ui/Button'
import { mediapipeDetector as detector } from '../detect/mediapipeDetector'
import { soundClassifier, soundEntryOn } from '../sound/soundModel'
import { notifyStorageChanged } from './useStorageStatus'

/** 받아 두는 모델의 공통 모양 — 새 찾기(detect/detector.ts)와 새소리(sound/classifier.ts) 어댑터가 둘 다 이 모양이다 */
interface Model {
  label: string
  sizeMb: number
  /** 이 브라우저에서 돌 수 있는지 — 새 찾기만 있다(wasm 컴파일이 막힌 사파리 15 이하는 false). 없으면 돈다고 본다 */
  supported?(): boolean
  isCached(): Promise<boolean>
  load(onProgress: (fraction: number) => void): Promise<void>
  clearCache(): Promise<void>
}

/** 모델 한 줄 — 이름·하는 일·크기와 받기/지우기. 받지 못하면 이유를 `onError`로 알린다 (카드 아래에 한 번 보여 준다) */
function ModelRow({ model, does, onError }: { model: Model; does: string; onError: (message: string) => void }) {
  const [cached, setCached] = useState<boolean | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  useEffect(() => { void model.isCached().then(setCached) }, [model])
  // 못 도는 브라우저에서 받기를 누르면 늘 실패한다 — 버튼 대신 그 사실을 적는다 (받아 둔 것이 있으면 지우기는 그대로)
  const usable = model.supported?.() ?? true

  async function download() {
    onError('')
    setProgress(0)
    try { await model.load(setProgress); setCached(true); notifyStorageChanged() } catch (e) { onError(e instanceof Error ? e.message : '받지 못했습니다.') } finally { setProgress(null) }
  }
  async function clear() {
    await model.clearCache()
    setCached(false)
    // 저장 공간 카드의 쓰는 양을 다시 재게 한다 — 지우는 것이 폰 공간을 돌려받는 수단이라 숫자가 따라 바뀌어야 한다
    notifyStorageChanged()
  }

  return (
    <li>
      <div><strong>{model.label}</strong><small>{does} · {model.sizeMb}MB · 기기 안에서 실행</small></div>
      {progress !== null ? <span className="hint">{progress < 1 ? `${Math.round(progress * 100)}%` : '준비 중'}</span>
        : cached === null ? null
        : !cached && !usable ? <span className="hint">이 브라우저에서는 쓸 수 없음</span>
        : <Button variant="quiet" icon={cached ? 'trash' : 'download'} onClick={() => void (cached ? clear() : download())}>{cached ? '지우기' : '받기'}</Button>}
    </li>
  )
}

/**
 * 이 기기에 받아 둔 모델. 지우기는 폰 저장 공간을 돌려받는 수단이고, 받기는 와이파이에 있을 때 미리 받아 두는 수단이다.
 * 모델이 늘면 여기 목록에 한 줄씩 더한다. 새소리 줄은 새소리 듣기를 열어 둔 판에서만 보인다 (sound/soundModel.ts soundEntryOn).
 */
export default function ModelSection() {
  const [error, setError] = useState('')
  return (
    <Card>
      <h2>받은 모델</h2>
      <ul className="model-list">
        <ModelRow model={detector} does="사진에서 새의 위치를 찾습니다" onError={setError} />
        {soundEntryOn && <ModelRow model={soundClassifier} does="소리에서 새 이름을 찾습니다" onError={setError} />}
      </ul>
      {error && <p className="status-line is-warn" role="alert">{error}</p>}
    </Card>
  )
}
