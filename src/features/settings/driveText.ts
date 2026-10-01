/**
 * 드라이브 동기화 카드(settings/DriveSection)의 상태 문구를 만드는 순수 함수. node --test로 검사한다.
 */
import type { SyncStatus } from '../../data/syncStatus'
// 확장자를 적는 이유: node --test가 이 파일을 직접 읽는다 (Vite는 어느 쪽이든 된다)
import { recentTimeOf } from '../../ui/when.ts'
import type { TaskMessage } from './useTask'

/**
 * 상태 줄이 읽는 칸. SyncStatus 전체가 아니라 쓰는 칸만 받는다 — 다른 작업이 SyncStatus에 칸을 더해도
 * 이 함수와 그 테스트가 영향받지 않게 한다.
 */
export type StatusInput = Pick<SyncStatus, 'phase' | 'pending' | 'stuck' | 'message' | 'lastSyncAt'>

/**
 * 지금 상태를 한 줄로. 위에서부터 먼저 맞는 것 하나만 적는다 (우선순위가 곧 이 순서다):
 * 동기화 중 → 로그인 풀림 → 인터넷 끊김 → 여러 번 못 올려 멈춘 기록 → 그 밖의 실패 → 아직 안 올린 기록 → 다 올라감.
 * 멈춘 기록(`stuck`)은 phase가 error여도 앞서고, 안 올린 기록(`pending`)은 그 밖의 실패 뒤다.
 * 실패인데 이유(`message`)가 비면 일반 문구를 쓴다. 마지막 동기화 시각이 없거나 못 읽으면 "연결됨"만 적는다.
 * `now`는 검사를 위해 받는다 (마지막 동기화의 "오늘·어제" 경계는 브라우저 시간대).
 */
export function statusLine(s: StatusInput, now = new Date()): TaskMessage {
  const last = recentTimeOf(s.lastSyncAt, now)
  if (s.phase === 'syncing') return { tone: 'ok', text: '동기화하는 중…' }
  if (s.phase === 'disconnected') return { tone: 'warn', text: '구글 로그인이 풀렸습니다. 다시 로그인하면 못 올린 기록부터 이어서 올립니다.' }
  if (s.phase === 'offline') return { tone: 'warn', text: `인터넷이 끊겨 있습니다${s.pending ? ` — 올릴 기록 ${s.pending}건은 연결되면 올립니다` : ''}.` }
  if (s.stuck) return { tone: 'warn', text: `${s.stuck}건을 여러 번 올리지 못해 멈췄습니다. "지금 동기화"를 눌러 다시 해 보세요.${s.message ? ` (${s.message})` : ''}` }
  if (s.phase === 'error') return { tone: 'warn', text: s.message || '동기화하지 못했습니다. 잠시 뒤 다시 합니다.' }
  if (s.pending) return { tone: 'warn', text: `드라이브에 아직 안 올라간 기록 ${s.pending}건` }
  return { tone: 'ok', text: last ? `모든 기록이 드라이브에 있습니다 · 마지막 동기화 ${last}` : '연결됨' }
}

/**
 * '연결 끊기' 뒤의 결과 줄. 드라이브의 사본과 이 기기의 기록은 그대로라고 적는다.
 * 이동 기록 올리기를 켜 두었던 기기면 그것도 꺼졌다고 더한다 — `data/sync.ts disconnect`가 끈다 (다시 연결하는 계정이 다를 수 있어서).
 * 말하지 않으면 다시 연결한 뒤 이동 기록이 계속 오간다고 여긴다. 꺼져 있었으면 더하지 않는다 — 켠 적 없는 스위치가 꺼졌다는 말은 헷갈린다.
 */
export function disconnectedText(tracksWasOn: boolean): TaskMessage {
  const tracks = tracksWasOn ? ' 이동 기록 올리기도 껐습니다 — 다시 연결한 뒤 올리려면 이동 기록 카드에서 다시 켜 주세요.' : ''
  return { tone: 'ok', text: `연결을 끊었습니다. 드라이브의 사본과 이 기기의 기록은 그대로 있습니다.${tracks}` }
}
