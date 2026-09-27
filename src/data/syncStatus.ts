/**
 * 드라이브 동기화의 지금 상태 하나 — 설정 카드와 도감 위 띠가 같은 값을 본다.
 * React 밖(sync.ts)에서 바뀌므로 작은 구독 저장소로 두고, 화면은 `useSyncStatus`로 읽는다.
 */
import { useSyncExternalStore } from 'react'

export interface SyncStatus {
  /** 운영자가 구글 설정을 마쳤는지. 아직 모르면 null — false면 드라이브 기능을 보이지 않는다 */
  configured: boolean | null
  clientId: string
  /** 사용자가 드라이브를 연결했는지 (로그인했고 끊지 않았다) */
  linked: boolean
  /**
   * idle = 쉬는 중 · syncing = 하는 중 · disconnected = 연결이 풀려 "다시 연결"이 필요 · offline = 인터넷 없음 ·
   * error = 그 밖의 실패 (message에 이유)
   */
  phase: 'idle' | 'syncing' | 'disconnected' | 'offline' | 'error'
  /** 아직 드라이브에 닿지 않은 기록 수 (줄의 항목 수) */
  pending: number
  /** 그중 자동 재시도를 멈춘 수 — "지금 올리기"를 눌러야 다시 한다 */
  stuck: number
  /** 마지막으로 끝까지 동기화한 시각 (UTC ISO). 없으면 '' */
  lastSyncAt: string
  message: string
}

let status: SyncStatus = { configured: null, clientId: '', linked: false, phase: 'idle', pending: 0, stuck: 0, lastSyncAt: '', message: '' }
const listeners = new Set<() => void>()

/** 지금 상태 */
export function getSyncStatus(): SyncStatus {
  return status
}

/** 상태의 일부를 바꾸고 구독자에게 알린다 */
export function setSyncStatus(patch: Partial<SyncStatus>): void {
  status = { ...status, ...patch }
  for (const l of listeners) l()
}

/** 화면에서 상태를 읽는다 — 바뀌면 다시 그린다 */
export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l) } }, getSyncStatus)
}
