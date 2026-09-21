import { useRef, useState } from 'react'
import { exportBackup, importBackup } from '../../data/backup'
import { useJournal } from '../../data/journal'
import { Card } from '../../ui/bits'
import Button from '../../ui/Button'
import { saveFile } from '../dex/saveFile'

/**
 * 백업. 기록이 이 기기에만 있어서, 이 앱에서 잃으면 안 되는 단 하나의 기능이다.
 * 내려받기는 파일을 넘긴 뒤에야 "백업됨"으로 표시한다. 불러오기는 더하기만 한다 (기기에만 있는 기록을 지우지 않는다).
 */
export default function BackupSection() {
  const { sightings, unsaved, markBackedUp, reload } = useJournal()
  const fileInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null)

  /** 작업을 돌리고 결과나 실패 이유를 아래 줄에 적는다 (조용히 실패하지 않는다) */
  async function run(work: () => Promise<string>) {
    setBusy(true)
    setMessage(null)
    try { setMessage({ tone: 'ok', text: await work() }) } catch (e) { setMessage({ tone: 'warn', text: e instanceof Error ? e.message : '실패했습니다.' }) } finally { setBusy(false) }
  }

  const download = () => run(async () => {
    await saveFile(await exportBackup(), `탐조일지-백업-${new Date().toISOString().slice(0, 10)}.zip`)
    await markBackedUp()
    return '백업 파일을 만들었습니다. 잃어버리지 않을 곳에 보관하세요.'
  })
  const upload = (file: File) => run(async () => {
    const plan = await importBackup(file)
    await reload()
    return `불러왔습니다 — 새 기록 ${plan.add.length}건, 갱신 ${plan.update.length}건, 그대로 둔 기록 ${plan.kept}건`
  })

  return (
    <Card>
      <h2>백업</h2>
      <p className="hint">기록과 사진은 이 기기에만 저장됩니다. 파일로 내려받아 두면 다른 기기에서 이어 쓸 수 있고, 브라우저 자료가 지워져도 되살릴 수 있습니다.</p>
      <p className={unsaved ? 'status-line is-warn' : 'status-line is-ok'}>
        {unsaved ? `백업 안 된 기록 ${unsaved}건` : '모든 기록이 백업돼 있습니다'} · 전체 {(sightings ?? []).length}건
      </p>
      <input ref={fileInput} type="file" accept=".zip,application/zip" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = '' }} />
      <div className="row-actions">
        <Button variant={unsaved ? 'primary' : 'secondary'} icon="download" onClick={() => void download()} disabled={busy}>백업 파일 내려받기</Button>
        <Button icon="upload" onClick={() => fileInput.current?.click()} disabled={busy}>백업 파일 불러오기</Button>
      </div>
      {message && <p className={`status-line is-${message.tone}`} role="status">{message.text}</p>}
    </Card>
  )
}
