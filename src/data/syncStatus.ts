/**
 * 드라이브 동기화의 지금 상태 하나 — 설정 카드와 도감 위 띠가 같은 값을 본다.
 * React 밖(sync.ts)에서 바뀌므로 작은 구독 저장소로 두고, 화면은 `useSyncStatus`로 읽는다.
 */
import { useSyncExternalStore } from 'react'

/** 이동 기록 카드의 동기화 줄 — 무엇이 있었는지만 적고, 문구는 화면이 만든다 (features/tracks/trackText.ts) */
export type TracksSyncNote =
  | { kind: 'syncing' }
  /** 드라이브와 같다 — count는 이 기기의 점 수 */
  | { kind: 'same'; count: number }
  /** 이번에 맞추지 못했다 — 30분이 지난 뒤의 동기화(또는 '지금 동기화') 때 다시 한다. reason은 한국어 이유 (좌표를 담지 않는다) */
  | { kind: 'failed'; reason: string }
  /** 켠 뒤에 드라이브의 이동 기록이 지워져(다른 기기) 이 기기의 스위치를 껐다 */
  | { kind: 'clearedElsewhere' }

/** 이동 기록의 드라이브 동기화 상태 (data/syncTracks.ts) */
export interface TracksSyncStatus {
  /** 이 기기의 '이동 기록도 구글 드라이브에 올리기' 스위치. 기본 끔 */
  on: boolean
  /** 드라이브에 이동 기록이 있다고 이 기기가 마지막으로 본 것 — 스위치를 꺼도 '드라이브의 이동 기록 지우기'를 보일지 */
  onDrive: boolean
  /** 이 앱을 연 뒤 마지막으로 맞춰 본 결과. 아직 없으면 null */
  note: TracksSyncNote | null
  /** 드라이브에서 받아 이 기기의 이동 기록이 바뀔 때마다 1씩 오른다 — 이동 기록 카드가 요약을 다시 읽는다 */
  rev: number
}

/** 이동 기록 상태를 아직 읽지 않았을 때의 값 — 스위치 꺼짐 */
export const TRACKS_SYNC_IDLE: TracksSyncStatus = { on: false, onDrive: false, note: null, rev: 0 }

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
  /** 이동 기록의 드라이브 동기화. 선택 칸 — 없으면 TRACKS_SYNC_IDLE로 읽는다 (tracksStatusOf) */
  tracks?: TracksSyncStatus
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

/** 상태의 이동 기록 칸. 없으면 기본값(꺼짐) */
export function tracksStatusOf(s: SyncStatus): TracksSyncStatus {
  return s.tracks ?? TRACKS_SYNC_IDLE
}

/** 이동 기록 칸의 일부를 바꾸고 구독자에게 알린다 */
export function setTracksStatus(patch: Partial<TracksSyncStatus>): void {
  setSyncStatus({ tracks: { ...tracksStatusOf(status), ...patch } })
}

/** 화면에서 상태를 읽는다 — 바뀌면 다시 그린다 */
export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l) } }, getSyncStatus)
}
