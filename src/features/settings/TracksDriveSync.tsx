import { useEffect, useRef, useState } from 'react'
import { clearDriveTracksNow, syncAgain } from '../../data/sync'
import { getSyncStatus, tracksStatusOf, useSyncStatus } from '../../data/syncStatus'
import { setTracksSyncOn } from '../../data/syncTracks'
import Button from '../../ui/Button'
import { tracksSyncLine } from '../tracks/trackText'
import TaskResult from './TaskResult'
import { useTask } from './useTask'

interface Props {
  /** 드라이브에서 받아 이 기기의 이동 기록이 바뀌었을 때 — 카드가 요약을 다시 읽고 저장 공간 카드에 알린다 */
  onReceived: () => void
}

/**
 * 이동 기록 카드 안의 '이동 기록도 구글 드라이브에 올리기' 스위치(기본 끔), 그 상태 줄, '드라이브의 이동 기록 지우기'.
 * 드라이브를 연결했을 때만 그린다 — 연결 전에는 켜도 할 일이 없는 스위치다 (동작하지 않는 버튼을 만들지 않는다).
 * 스위치는 기기마다다. 켜면 곧 동기화해 이 기기의 점을 올리고 같은 계정의 다른 기기가 올린 점을 받아 합친다 (data/syncTracks.ts).
 * 끄면 올리기·받기만 멈추고 드라이브의 사본은 그대로 둔다 — 그 자리에서 알리고, 지우는 버튼을 곁에 둔다.
 * 모양은 AI 카드의 고르기 줄(.radio-rows — 22px 체크·작은 설명)을 그대로 쓴다 (새 CSS 없음).
 */
export default function TracksDriveSync({ onReceived }: Props) {
  const s = useSyncStatus()
  const t = tracksStatusOf(s)
  const [confirming, setConfirming] = useState(false)
  // 끝나면(성공·실패 모두) 묻던 것을 거둔다
  const { busy, message, setMessage, run } = useTask({ after: () => setConfirming(false) })
  const seenRev = useRef(t.rev)

  // 드라이브에서 받아 기기가 바뀌면(rev가 오르면) 카드에 알린다. 처음 그릴 때의 값은 카드가 이미 읽었다
  useEffect(() => {
    if (t.rev === seenRev.current) return
    seenRev.current = t.rev
    onReceived()
  }, [t.rev, onReceived])

  if (!s.configured || !s.linked) return null

  /** 켜면 곧 동기화한다 (결과는 상태 줄에). 드라이브에 닿지 못해 이번에 못 맞췄으면 그렇게 알린다 */
  const toggle = (on: boolean) => run(async () => {
    await setTracksSyncOn(on)
    if (!on) return { tone: 'ok', text: t.onDrive ? "올리기를 껐습니다. 드라이브에 올라간 사본은 그대로 있습니다 — 지우려면 '드라이브의 이동 기록 지우기'." : '올리기를 껐습니다.' }
    await syncAgain()
    if (tracksStatusOf(getSyncStatus()).note) return null
    return { tone: 'warn', text: '켰습니다. 드라이브에 닿지 못해 아직 올리지 않았습니다 — 다음 동기화 때 올립니다.' }
  })
  const clearDrive = () => run(async () => {
    await clearDriveTracksNow()
    return { tone: 'ok', text: '드라이브의 이동 기록을 지우고 이 기기의 올리기를 껐습니다. 이 기기의 이동 기록은 그대로 있습니다.' }
  })

  // 꺼져 있을 때는 "다른 기기가 지워 껐다"만 남긴다 — 끄기 전의 "같습니다"는 이제 맞지 않다
  const line = t.on || t.note?.kind === 'clearedElsewhere' ? tracksSyncLine(t.note) : null
  return (
    <>
      <div className="radio-rows">
        {/* 이동 기록도 드라이브에 올리기: PC에서 넣은 타임라인을 폰에서 또 넣지 않게. 기록보다 민감해(몇 달치 경로) 드라이브를 연결해도 따로 켜기 전에는 한 점도 나가지 않는다 — 기본 끔, 기기마다 */}
        <label>
          <input type="checkbox" checked={t.on} disabled={busy} onChange={(e) => void toggle(e.target.checked)} />
          <span>
            <strong>이동 기록도 구글 드라이브에 올리기</strong>
            <small>켜면 이 기기에 골라 둔 점(시각·좌표 — 몇 달치 이동 경로)이 내 구글 드라이브의 '탐조일지 동기화/tracks' 폴더로 곧장 가고, 같은 계정에서 이 스위치를 켠 다른 기기와 합쳐집니다. 타임라인 원본 파일은 올리지 않습니다. 기기마다 따로 켜며, 그 폴더를 남과 공유하면 이동 경로도 보입니다.</small>
          </span>
        </label>
      </div>
      {line && <p className={`status-line is-${line.tone}`}>{line.text}</p>}
      {(t.on || t.onDrive) && (
        <DriveClear confirming={confirming} busy={busy} onAsk={() => { setMessage(null); setConfirming(true) }} onCancel={() => setConfirming(false)} onConfirm={() => void clearDrive()} />
      )}
      <TaskResult message={message} />
    </>
  )
}

interface DriveClearProps {
  /** 되묻는 중인지 */
  confirming: boolean
  busy: boolean
  /** '드라이브의 이동 기록 지우기' — 되묻기를 연다 */
  onAsk: () => void
  onCancel: () => void
  onConfirm: () => void
}

/**
 * '드라이브의 이동 기록 지우기'와 같은 자리의 되묻기 (저장 공간 카드의 '정리하기 → 정말 지우기 / 그만두기'와 같은 방식).
 * 스위치를 켰거나 드라이브에 사본이 있다고 봤을 때만 부모가 그린다.
 */
function DriveClear({ confirming, busy, onAsk, onCancel, onConfirm }: DriveClearProps) {
  // 드라이브의 이동 기록 지우기: 끄기는 사본을 남긴다 — 드라이브에서 직접 지우면 켜 둔 다른 기기가 다시 올리므로 "지웠음" 표시를 남기는 이 길이 있어야 한다.
  // 3개월이 지난 점은 구글에서 다시 못 받아 되돌릴 수 없으므로 같은 자리에서 한 번 더 묻는다
  if (!confirming) return <Button variant="quiet" icon="trash" onClick={onAsk} disabled={busy}>드라이브의 이동 기록 지우기</Button>
  return (
    <>
      <p className="status-line is-warn">드라이브의 이동 기록을 지우면 다른 기기는 더 받을 수 없고, 3개월이 지난 점은 구글에서도 다시 내보낼 수 없습니다. 이 기기의 이동 기록은 그대로 남습니다.</p>
      <div className="row-actions">
        <Button variant="danger" icon="trash" onClick={onConfirm} disabled={busy}>정말 지우기</Button>
        <Button variant="quiet" onClick={onCancel} disabled={busy}>그만두기</Button>
      </div>
    </>
  )
}
