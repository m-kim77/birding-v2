import { useCallback, useEffect, useRef, useState } from 'react'
import { soundClassifier as classifier } from './soundModel'

/**
 * checking: 받아 둔 모델이 있는지 보는 중 · missing: 없음(받을지 물어야 함) · downloading: 받는 중
 * · preparing: 받은 뒤 판정 준비 중 · ready: 판정할 수 있음
 */
export type SoundModelState = 'checking' | 'missing' | 'downloading' | 'preparing' | 'ready'

/**
 * 새소리 모델의 상태. 받아 둔 모델이 있으면 화면을 열자마자 준비한다 (기기 안에서 도는 공짜 작업이라 버튼이 없다 — 새는 기다려 주지 않는다).
 * 없으면 `missing`으로 두고 사용자가 누를 때까지 기다린다 — 수십 MB를 말없이 받지 않는다.
 * 받기·준비가 실패하면 `error`에 안내를 담고 `missing`으로 돌아간다.
 */
export function useSoundModel() {
  const [state, setState] = useState<SoundModelState>('checking')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  /** 돌고 있는 준비. 두 번 눌러도 받기를 두 번 하지 않게 같은 약속을 돌려준다 */
  const loading = useRef<Promise<boolean> | null>(null)

  /** 모델을 (없으면 받아서) 준비한다. 됐으면 true, 실패하면 false — 던지지 않는다 */
  const ensure = useCallback((): Promise<boolean> => {
    loading.current ??= (async () => {
      setError('')
      setProgress(0)
      setState('downloading')
      try {
        await classifier.load((fraction) => { setProgress(fraction); if (fraction >= 1) setState('preparing') })
        setState('ready')
        return true
      } catch (e) {
        setError(e instanceof Error ? e.message : '새소리 모델을 준비하지 못했습니다.')
        setState('missing')
        return false
      } finally {
        loading.current = null
      }
    })()
    return loading.current
  }, [])

  useEffect(() => {
    void classifier.isCached().then((has) => { if (has) void ensure(); else setState((s) => (s === 'checking' ? 'missing' : s)) })
  }, [ensure])

  return { state, progress, error, ensure, sizeMb: classifier.sizeMb, demo: classifier.demo }
}
