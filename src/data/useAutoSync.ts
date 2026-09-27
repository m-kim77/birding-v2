import { useEffect } from 'react'
import { setOnPulled, startSync, syncNow } from './sync'
import { getSyncStatus } from './syncStatus'

/** 올릴 일이 남았을 때 다시 보는 간격. 각 항목의 재시도 시각(syncPlan.ts afterFailure)은 따로 지켜진다 */
const RETRY_MS = 60_000

/**
 * 드라이브 동기화를 저절로 돌린다: 앱을 열 때 한 번, 인터넷이 다시 붙을 때, 이 탭으로 돌아올 때,
 * 그리고 올릴 일이 남아 있으면 1분마다. 연결이 풀렸거나(disconnected) 연결 안 한 사용자면 돌지 않는다 (sync.ts가 거른다).
 * `reload`는 다른 기기의 기록을 받아 기기가 바뀌었을 때 부른다.
 */
export function useAutoSync(reload: () => Promise<void>): void {
  useEffect(() => {
    setOnPulled(() => { void reload() })
    void startSync()
    const again = () => { if (getSyncStatus().phase !== 'disconnected') void syncNow() }
    const onVisible = () => { if (document.visibilityState === 'visible') again() }
    window.addEventListener('online', again)
    document.addEventListener('visibilitychange', onVisible)
    const timer = setInterval(() => { if (getSyncStatus().pending > 0) again() }, RETRY_MS)
    return () => {
      window.removeEventListener('online', again)
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(timer)
    }
  }, [reload])
}
