import { useEffect } from 'react'
import { connect, disconnect, joinAccount, loadConfig, refuseAccount, syncNow } from '../../data/sync'
import { getSyncStatus, tracksStatusOf, useSyncStatus } from '../../data/syncStatus'
import { preloadGis } from '../../lib/google/gis'
import { Card } from '../../ui/bits'
import Button from '../../ui/Button'
import { disconnectedText, refusedText, statusLine } from './driveText'
import TaskResult from './TaskResult'
import { useTask } from './useTask'

/**
 * 구글 드라이브 동기화. "구글로 로그인" 한 번이 곧 드라이브 연결이다 — 그 뒤로는 저장할 때마다 저절로 올리고, 앱을 열 때 받는다.
 * 운영자가 구글 설정을 마치지 않았으면(configured=false) 카드를 그리지 않는다 (동작하지 않는 버튼을 만들지 않는다).
 * 로그인 창 스크립트는 카드가 보일 때 미리 불러 둔다 — 누른 뒤에 불러오면 팝업이 막힌다 (gis.ts).
 * 전에 동기화하던 것과 다른 구글 계정으로 로그인했으면(phase 'account') 다른 버튼 대신 합칠지 묻는다 (AccountAsk).
 */
export default function DriveSection() {
  const s = useSyncStatus()
  const { busy, message, run } = useTask()

  useEffect(() => { void loadConfig() }, [])
  useEffect(() => { if (s.configured) void preloadGis().catch(() => {}) }, [s.configured])

  if (!s.configured) return null
  const needLogin = !s.linked || s.phase === 'disconnected'
  const asking = s.linked && s.phase === 'account'
  const line = statusLine(s)
  /** 다른 계정에 합친다 — 곧 동기화하고 결과는 상태 줄에 */
  const join = () => run(async () => { await joinAccount(); return null })
  /** 합치지 않는다 — 새 계정의 연결을 끊는다 (이 기기의 기록은 그대로) */
  const refuse = () => run(async () => refusedText(await refuseAccount()))
  return (
    <Card>
      <h2>구글 드라이브 동기화</h2>
      <p className="hint">구글로 로그인하면 기록과 사진의 사본이 내 구글 드라이브의 '탐조일지 동기화' 폴더에 저절로 올라가고, 다른 기기에서 같은 계정으로 로그인하면 이어서 볼 수 있습니다. 이 사이트의 서버에는 저장하지 않습니다.</p>
      {s.linked && <p className={`status-line is-${line.tone}`}>{line.text}</p>}
      {asking && <AccountAsk busy={busy} onJoin={() => void join()} onRefuse={() => void refuse()} />}
      {!asking && <div className="row-actions">
        {needLogin && <Button variant="primary" icon="upload" onClick={() => void run(async () => { await connect(); return null })} disabled={busy}>{s.linked ? '다시 로그인' : '구글로 로그인'}</Button>}
        {s.linked && !needLogin && <Button icon="upload" onClick={() => void run(async () => { await syncNow(true); return null })} disabled={busy || s.phase === 'syncing'}>지금 동기화</Button>}
        {s.linked && <Button variant="quiet" onClick={() => void run(async () => {
          // 끊기 전에 읽는다 — disconnect가 이동 기록 스위치를 끈다
          const tracksWasOn = tracksStatusOf(getSyncStatus()).on
          await disconnect()
          return disconnectedText(tracksWasOn)
        })} disabled={busy}>연결 끊기</Button>}
      </div>}
      <TaskResult message={message} />
    </Card>
  )
}

interface AccountAskProps {
  busy: boolean
  /** '이 계정에 합치기' */
  onJoin: () => void
  /** '합치지 않고 연결 끊기' */
  onRefuse: () => void
}

/**
 * 다른 구글 계정으로 로그인했을 때의 물음. 고르기 전에는 동기화가 돌지 않는다 (data/syncAccount.ts) —
 * 합치면 되돌릴 수 없으니(그 계정의 드라이브에 사본이 남는다) 무엇이 어디로 가는지 먼저 적는다. 두 버튼은 같은 무게로 둔다.
 */
function AccountAsk({ busy, onJoin, onRefuse }: AccountAskProps) {
  return (
    <>
      <p className="hint">이 계정으로 이어 가면 이 기기의 기록과 사진(위치 포함)이 이 계정의 드라이브에 올라가고, 이 계정의 드라이브에 있던 기록은 이 기기의 일지로 내려와 섞입니다. 이동 기록은 올리지 않습니다 — 올리려면 합친 뒤 이동 기록 카드에서 다시 켜 주세요. 이 계정이 아니라면 연결을 끊고 전에 쓰던 계정으로 다시 로그인하세요.</p>
      <div className="row-actions">
        <Button icon="upload" onClick={onJoin} disabled={busy}>이 계정에 합치기</Button>
        <Button onClick={onRefuse} disabled={busy}>합치지 않고 연결 끊기</Button>
      </div>
    </>
  )
}
