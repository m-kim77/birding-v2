import { useState } from 'react'
import { useJournal } from '../../data/journal'
import { deleteOrphanPhotos } from '../../data/photoCheck'
import type { PhotoKind, Sighting } from '../../types'
import { Card } from '../../ui/bits'
import Button from '../../ui/Button'
import { dayOf } from '../../ui/when'
import { missingKindsText, usageLine } from './storageText'
import { useStorageStatus } from './useStorageStatus'

/** 사진이 빠진 기록은 이만큼만 줄로 보인다 — 수백 건이면 카드가 목록이 된다. 나머지는 "외 N건" */
const SHOW_MISSING = 5

type Message = { tone: 'ok' | 'warn'; text: string }
/** 사진이 빠진 기록 한 줄: 그 기록과 없는 판 */
type MissingRow = { s: Sighting; kinds: PhotoKind[] }

interface Props {
  /** 사진이 빠진 기록의 '열기' — 그 기록의 상세로 */
  onOpenRecord: (id: string) => void
}

/**
 * 저장 공간: 이 앱이 기기 공간을 얼마나 쓰는지, 사진이 제자리에 있는지. 백업 카드 바로 아래에 둔다 —
 * 사진이 빠진 기록을 되살리는 길이 위의 '백업 파일 불러오기'다 (빠진 판만 채운다, backupFormat.ts shouldCopyPhoto).
 * 점검은 화면을 열 때 저절로 한다 (키만 읽어 가볍다 — 점검 버튼을 두지 않는다). 누르는 것은 기록이 없는 사진의 정리뿐이고,
 * 되돌릴 수 없어서 기록 삭제처럼 같은 자리에서 한 번 더 묻는다.
 */
export default function StorageSection({ onOpenRecord }: Props) {
  const { sightings } = useJournal()
  const { estimate, check, refresh } = useStorageStatus()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<Message | null>(null)

  /** 기록이 없는 사진을 지운다. 지울 것은 지우는 순간에 다시 센다(deleteOrphanPhotos) — 알리는 수도 그 값이다. 끝나면 다시 잰다 */
  async function clean() {
    setBusy(true)
    setMessage(null)
    try {
      const n = await deleteOrphanPhotos()
      setMessage({ tone: 'ok', text: n ? `기록이 없는 사진 ${n}건을 지웠습니다.` : '지울 사진이 없었습니다.' })
    } catch (e) {
      setMessage({ tone: 'warn', text: e instanceof Error ? e.message : '지우지 못했습니다.' })
    } finally {
      setBusy(false)
      setConfirming(false)
      await refresh()
    }
  }

  // undefined는 재는 중, null은 브라우저가 쓰는 양을 알려 주지 않음
  const usage = estimate ? usageLine(estimate) : estimate
  const byId = new Map((sightings ?? []).map((s) => [s.id, s]))
  // 화면에 그릴 수 있는 기록만 — 점검(DB)과 화면 상태(journal)가 잠깐 어긋나도 없는 기록을 줄로 그리지 않는다.
  // 일지처럼 최신 촬영부터 (DB는 id 순으로 주는데, id는 무작위라 순서에 뜻이 없다)
  const missing: MissingRow[] = (check?.missing ?? [])
    .flatMap((m) => { const s = byId.get(m.id); return s ? [{ s, kinds: m.kinds }] : [] })
    .sort((a, b) => b.s.capturedAt.localeCompare(a.s.capturedAt))
  const orphans = check?.orphanRecords ?? 0
  return (
    <Card>
      <h2>저장 공간</h2>
      {/* 재는 중(undefined)에는 아무것도 그리지 않는다 — "알려 주지 않습니다"로 잘못 보이지 않게 */}
      {usage && <p className={usage.tone === 'warn' ? 'status-line is-warn' : 'status-line'}>{usage.text}</p>}
      {usage && <p className="hint">기록·사진과 쓰던 기록·받은 모델·이동 기록을 합친 양입니다 (브라우저의 어림값).</p>}
      {usage === null && <p className="hint">이 브라우저는 쓰는 공간을 알려 주지 않습니다.</p>}
      {check === null && <p className="status-line is-warn">사진을 점검하지 못했습니다.</p>}
      {check && missing.length === 0 && orphans === 0 && byId.size > 0 && <p className="status-line is-ok">모든 기록의 사진이 제자리에 있습니다</p>}
      {missing.length > 0 && <MissingList items={missing} onOpenRecord={onOpenRecord} />}
      {orphans > 0 && (
        <>
          <p className="status-line">기록이 없는 사진 {orphans}건 — 지웠거나 저장이 끊긴 기록의 사진이 남은 것입니다. 목록·백업 어디에도 나오지 않고 공간만 차지합니다.</p>
          {/* 정리하기: 이 사진들은 앱 어디에서도 보이지 않아 지울 길이 이것뿐이다. 되돌릴 수 없어 같은 자리에서 한 번 더 묻는다 */}
          {confirming ? (
            <>
              <p className="status-line is-warn">지운 사진은 되돌릴 수 없습니다.</p>
              <div className="row-actions">
                <Button variant="danger" icon="trash" onClick={() => void clean()} disabled={busy}>정말 지우기</Button>
                <Button variant="quiet" onClick={() => setConfirming(false)} disabled={busy}>그만두기</Button>
              </div>
            </>
          ) : <Button variant="quiet" icon="trash" onClick={() => { setMessage(null); setConfirming(true) }}>정리하기</Button>}
        </>
      )}
      {message && <p className={`status-line is-${message.tone}`} role="status">{message.text}</p>}
    </Card>
  )
}

/**
 * 사진이 빠진 기록: 몇 건인지, 되살리는 길, 앞의 몇 건. 줄의 '열기'는 그 기록으로 간다 —
 * 일지에는 사진이 빠진 기록만 골라 보는 칸이 없어서, 없으면 어느 기록인지 찾아갈 길이 없다.
 * 모양은 받은 모델 목록(.model-list — 줄마다 설명 + 버튼)을 그대로 쓴다.
 */
function MissingList({ items, onOpenRecord }: { items: MissingRow[]; onOpenRecord: (id: string) => void }) {
  return (
    <>
      <p className="status-line is-warn">사진이 빠진 기록 {items.length}건 — 그 사진이 든 백업 파일이 있으면 위의 '백업 파일 불러오기'로 채울 수 있습니다.</p>
      <ul className="model-list">
        {items.slice(0, SHOW_MISSING).map(({ s, kinds }) => (
          <li key={s.id}>
            <div><strong>{s.speciesKo || '이름 미정'}</strong><small>{dayOf(s)} · {missingKindsText(kinds)}</small></div>
            <Button variant="quiet" onClick={() => onOpenRecord(s.id)}>열기</Button>
          </li>
        ))}
      </ul>
      {items.length > SHOW_MISSING && <p className="hint">외 {items.length - SHOW_MISSING}건</p>}
    </>
  )
}
