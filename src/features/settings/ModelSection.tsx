import { useEffect, useState } from 'react'
import { Card } from '../../ui/bits'
import Button from '../../ui/Button'
import { mediapipeDetector as detector } from '../detect/mediapipeDetector'

/**
 * 이 기기에 받아 둔 모델. 지우기는 폰 저장 공간을 돌려받는 수단이고, 받기는 와이파이에 있을 때 미리 받아 두는 수단이다.
 * 모델이 늘면(새소리 등) 여기 목록에 한 줄씩 더한다.
 */
export default function ModelSection() {
  const [cached, setCached] = useState<boolean | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { void detector.isCached().then(setCached) }, [])

  async function download() {
    setError('')
    setProgress(0)
    try { await detector.load(setProgress); setCached(true) } catch (e) { setError(e instanceof Error ? e.message : '받지 못했습니다.') } finally { setProgress(null) }
  }
  async function clear() {
    await detector.clearCache()
    setCached(false)
  }

  return (
    <Card>
      <h2>받은 모델</h2>
      <ul className="model-list">
        <li>
          <div><strong>{detector.label}</strong><small>사진에서 새의 위치를 찾습니다 · {detector.sizeMb}MB · 기기 안에서 실행</small></div>
          {progress !== null ? <span className="hint">{Math.round(progress * 100)}%</span>
            : cached === null ? null
            : <Button variant="quiet" icon={cached ? 'trash' : 'download'} onClick={() => void (cached ? clear() : download())}>{cached ? '지우기' : '받기'}</Button>}
        </li>
      </ul>
      {error && <p className="status-line is-warn" role="alert">{error}</p>}
    </Card>
  )
}
