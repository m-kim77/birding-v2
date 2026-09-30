import { useEffect } from 'react'
import { connect, disconnect, loadConfig, syncNow } from '../../data/sync'
import { getSyncStatus, tracksStatusOf, useSyncStatus } from '../../data/syncStatus'
import { preloadGis } from '../../lib/google/gis'
import { Card } from '../../ui/bits'
import Button from '../../ui/Button'
import { disconnectedText, statusLine } from './driveText'
import TaskResult from './TaskResult'
import { useTask } from './useTask'

/**
 * 구글 드라이브 동기화. "구글로 로그인" 한 번이 곧 드라이브 연결이다 — 그 뒤로는 저장할 때마다 저절로 올리고, 앱을 열 때 받는다.
 * 운영자가 구글 설정을 마치지 않았으면(configured=false) 카드를 그리지 않는다 (동작하지 않는 버튼을 만들지 않는다).
 * 로그인 창 스크립트는 카드가 보일 때 미리 불러 둔다 — 누른 뒤에 불러오면 팝업이 막힌다 (gis.ts).
 */
export default function DriveSection() {
  const s = useSyncStatus()
  const { busy, message, run } = useTask()

  useEffect(() => { void loadConfig() }, [])
  useEffect(() => { if (s.configured) void preloadGis().catch(() => {}) }, [s.configured])

  if (!s.configured) return null
  const needLogin = !s.linked || s.phase === 'disconnected'
  const line = statusLine(s)
  return (
    <Card>
      <h2>구글 드라이브 동기화</h2>
      <p className="hint">구글로 로그인하면 기록과 사진의 사본이 내 구글 드라이브의 '탐조일지 동기화' 폴더에 저절로 올라가고, 다른 기기에서 같은 계정으로 로그인하면 이어서 볼 수 있습니다. 이 사이트의 서버에는 저장하지 않습니다.</p>
      {s.linked && <p className={`status-line is-${line.tone}`}>{line.text}</p>}
      <div className="row-actions">
        {needLogin && <Button variant="primary" icon="upload" onClick={() => void run(async () => { await connect(); return null })} disabled={busy}>{s.linked ? '다시 로그인' : '구글로 로그인'}</Button>}
        {s.linked && !needLogin && <Button icon="upload" onClick={() => void run(async () => { await syncNow(true); return null })} disabled={busy || s.phase === 'syncing'}>지금 동기화</Button>}
        {s.linked && <Button variant="quiet" onClick={() => void run(async () => {
          // 끊기 전에 읽는다 — disconnect가 이동 기록 스위치를 끈다
          const tracksWasOn = tracksStatusOf(getSyncStatus()).on
          await disconnect()
          return disconnectedText(tracksWasOn)
        })} disabled={busy}>연결 끊기</Button>}
      </div>
      <TaskResult message={message} />
    </Card>
  )
}
