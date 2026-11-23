import { useEffect } from 'react'
import { connect, syncNow } from '../../data/sync'
import { useSyncStatus } from '../../data/syncStatus'
import { preloadGis } from '../../lib/google/gis'
import { Banner } from '../../ui/bits'
import Button from '../../ui/Button'

/**
 * 도감 위의 동기화 알림. 도감을 열 때 한 번 동기화하고, 드라이브에 아직 안 올라간 기록이 있거나 로그인이 풀렸으면 띠를 보인다.
 * 다 올라갔거나 드라이브를 연결하지 않은 사용자에게는 아무것도 보이지 않는다.
 * 다른 구글 계정으로 로그인해 멈췄으면(phase 'account') 설정에서 정하라고만 알린다 — 합칠지는 무엇이 어디로 가는지 적힌 설정 카드에서 고른다.
 */
export default function SyncBanner() {
  const s = useSyncStatus()
  useEffect(() => { void syncNow() }, [])
  // '다시 로그인'을 누른 순간 로그인 창을 열 수 있게 미리 불러 둔다 (gis.ts)
  useEffect(() => { if (s.phase === 'disconnected') void preloadGis().catch(() => {}) }, [s.phase])

  if (!s.linked) return null
  if (s.phase === 'account') {
    return <Banner tone="warn" icon="alert">다른 구글 계정으로 로그인해 동기화를 멈췄습니다 — 설정의 '구글 드라이브 동기화'에서 합칠지 정해 주세요.</Banner>
  }
  if (s.phase === 'disconnected') {
    return (
      <Banner tone="warn" icon="alert" action={<Button variant="quiet" onClick={() => void connect().catch(() => {})}>다시 로그인</Button>}>
        구글 드라이브 로그인이 풀렸습니다{s.pending ? ` — 올리지 못한 기록 ${s.pending}건` : ''}
      </Banner>
    )
  }
  if (!s.pending || s.phase === 'syncing') return null
  return (
    <Banner tone="warn" icon="upload" action={<Button variant="quiet" onClick={() => void syncNow(true)}>지금 올리기</Button>}>
      드라이브에 아직 안 올라간 기록 {s.pending}건{s.phase === 'offline' ? ' (인터넷 연결을 기다리는 중)' : ''}
    </Banner>
  )
}
