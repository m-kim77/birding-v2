import { useRef, useState } from 'react'
import { isTouchDevice } from '../../app/device'
import { exportBackup, importBackup } from '../../data/backup'
import { useJournal } from '../../data/journal'
import { Card } from '../../ui/bits'
import Button from '../../ui/Button'
import { daysAgoOf, fileDateToday } from '../../ui/when'
import { saveFile } from '../dex/saveFile'

type Message = { tone: 'ok' | 'warn'; text: string }

/**
 * 백업. 기록이 이 기기에만 있어서, 이 앱에서 잃으면 안 되는 단 하나의 기능이다.
 * "백업됨"은 파일이 정말 저장됐을 때만 적는다: PC는 내려받기가 믿을 만해 바로 적고, 폰은 공유 창·내려받기 결과를 브라우저가 정직하게
 * 알려 주지 않아서(saveFile.ts) 사용자가 "백업했습니다"를 눌러 확인해야 적는다. 불러오기는 더하기만 한다 (기기에만 있는 기록을 지우지 않는다).
 */
export default function BackupSection() {
  const { sightings, unsaved, lastBackupAt, persisted, markBackedUp, reload } = useJournal()
  const fileInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<Message | null>(null)
  const [awaitingConfirm, setAwaitingConfirm] = useState(false)

  /** 작업을 돌리고 결과나 실패 이유를 아래 줄에 적는다 (조용히 실패하지 않는다) */
  async function run(work: () => Promise<Message>) {
    setBusy(true)
    setMessage(null)
    setAwaitingConfirm(false)
    try { setMessage(await work()) } catch (e) { setMessage({ tone: 'warn', text: e instanceof Error ? e.message : '실패했습니다.' }) } finally { setBusy(false) }
  }

  const download = () => run(async () => {
    const outcome = await saveFile(await exportBackup(), `탐조일지-백업-${fileDateToday()}.zip`)
    // 취소는 실패도 성공도 아니다 — "백업됨"으로 적지 않는 것이 핵심이다
    if (outcome === 'cancelled') return { tone: 'warn', text: '저장을 취소했습니다 — 아직 백업되지 않았습니다.' }
    if (isTouchDevice()) {
      setAwaitingConfirm(true)
      return { tone: 'warn', text: outcome === 'shared' ? '공유 창에서 파일을 저장했다면 아래를 눌러 주세요.' : '내려받기가 시작됐습니다. 파일이 저장됐다면 아래를 눌러 주세요.' }
    }
    await markBackedUp()
    return { tone: 'ok', text: '백업 파일을 만들었습니다. 잃어버리지 않을 곳에 보관하세요.' }
  })
  /** 폰에서 사용자가 저장을 확인했을 때만 "백업됨"으로 적는다 */
  const confirm = () => run(async () => {
    await markBackedUp()
    return { tone: 'ok', text: '백업됐다고 적어 두었습니다. 파일은 잃어버리지 않을 곳에 보관하세요.' }
  })
  const upload = (file: File) => run(async () => {
    const plan = await importBackup(file)
    await reload()
    // 건너뛴 기록은 말없이 넘기지 않는다 — 파일에 있던 기록이 안 보이면 사용자는 유실로 안다
    const skipped = plan.skipped > 0 ? ` · 읽지 못한 기록 ${plan.skipped}건은 건너뛰었습니다` : ''
    return { tone: 'ok', text: `불러왔습니다 — 새 기록 ${plan.add.length}건, 갱신 ${plan.update.length}건, 그대로 둔 기록 ${plan.kept}건${skipped}` }
  })

  const ago = daysAgoOf(lastBackupAt)
  const total = (sightings ?? []).length
  return (
    <Card>
      <h2>백업</h2>
      <p className="hint">기록과 사진은 이 기기에만 저장됩니다. 파일로 내려받아 두면 다른 기기에서 이어 쓸 수 있고, 브라우저 자료가 지워져도 되살릴 수 있습니다.</p>
      <p className="hint">백업에는 화면용으로 줄인 사진(긴 변 2048px)이 들어갑니다 — 원본 사진은 따로 보관하세요.</p>
      <p className={unsaved ? 'status-line is-warn' : 'status-line is-ok'}>
        {ago ? `${unsaved ? `백업 안 된 기록 ${unsaved}건` : '모든 기록이 백업돼 있습니다'} · 전체 ${total}건 · 마지막 백업 ${ago}` : `아직 백업한 적 없음 · 전체 ${total}건`}
      </p>
      {persisted === false && isTouchDevice() && (
        // 브라우저가 저장소 보존을 거절한 폰 — 저장 공간이 모자라면 이 앱의 자료부터 지울 수 있다 (PC는 드문 일이라 말하지 않는다)
        <p className="status-line is-warn">이 브라우저는 저장 공간이 모자라면 이 앱의 기록을 지울 수 있습니다. 홈 화면에 추가해 쓰면 보호되고, 그 전에는 백업을 자주 해 두세요.</p>
      )}
      <input ref={fileInput} type="file" accept=".zip,application/zip" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = '' }} />
      <div className="row-actions">
        <Button variant={unsaved ? 'primary' : 'secondary'} icon="download" onClick={() => void download()} disabled={busy}>백업 파일 내려받기</Button>
        <Button icon="upload" onClick={() => fileInput.current?.click()} disabled={busy}>백업 파일 불러오기</Button>
      </div>
      {message && <p className={`status-line is-${message.tone}`} role="status">{message.text}</p>}
      {/* 백업했습니다: 폰에서는 앱이 저장 여부를 알 수 없다 — 사용자가 확인해 줘야 "백업됨"을 적을 수 있다 */}
      {awaitingConfirm && <Button icon="check" onClick={() => void confirm()} disabled={busy}>백업했습니다</Button>}
    </Card>
  )
}
