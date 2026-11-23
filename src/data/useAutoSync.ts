import { useEffect } from 'react'
import { setOnPulled, startSync, syncIfStale, syncNow } from './sync'
import { isDue } from './syncPlan'
import { getSyncStatus } from './syncStatus'

/** 올릴 일이 남았을 때 다시 보는 간격. 각 항목의 재시도 시각(syncPlan.ts afterFailure)은 따로 지켜진다 */
const RETRY_MS = 60_000

/**
 * 드라이브 동기화를 저절로 돌린다: 앱을 열 때 한 번, 인터넷이 다시 붙을 때, 이 탭으로 돌아올 때(1분 안에 받았으면 건너뜀 — `syncIfStale`),
 * 그리고 다시 할 때가 된 올릴 일이 있으면 1분마다 — 멈춘 항목이나 재시도 시각을 기다리는 항목만 남았으면 타이머는 돌지 않는다
 * (돌아도 올릴 것이 없는데 매번 드라이브 목록 전체를 받는다). 연결이 풀렸거나(disconnected) 연결 안 한 사용자면 돌지 않는다 (sync.ts가 거른다).
 * `reload`는 다른 기기의 기록을 받아 기기가 바뀌었을 때 부른다.
 */
export function useAutoSync(reload: () => Promise<void>): void {
  useEffect(() => {
    setOnPulled(() => { void reload() })
    void startSync()
    const again = () => { if (getSyncStatus().phase !== 'disconnected') void syncNow() }
    const onVisible = () => { if (document.visibilityState === 'visible' && getSyncStatus().phase !== 'disconnected') void syncIfStale() }
    window.addEventListener('online', again)
    document.addEventListener('visibilitychange', onVisible)
    const timer = setInterval(() => { if (isDue(getSyncStatus().nextDueAt, new Date())) again() }, RETRY_MS)
    return () => {
      window.removeEventListener('online', again)
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(timer)
    }
  }, [reload])
}
