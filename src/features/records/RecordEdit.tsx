import { Suspense, lazy, useState } from 'react'
import { useJournal } from '../../data/journal'
import { Card } from '../../ui/bits'
import Button from '../../ui/Button'
import type { Sighting } from '../../types'
import { EVIDENCE_LOSS_WARNING } from '../identify/verdictText'
import { PlaceRow } from '../record/RecordFacts'
import { usePlaceValue } from '../record/usePlace'
import { editPatch, formOf, placeBefore } from './editPatch'

// 위치 시트는 지도(Leaflet)를 끌고 온다. 이 파일은 기록 상세와 함께 첫 화면 묶음에 들어가므로, 시트를 열 때 받는다 —
// 그냥 import하면 지도를 안 여는 사람도 첫 화면에서 지도 라이브러리까지 받는다 (App.tsx가 지도를 늦게 받는 이유와 같다)
const LocationSheet = lazy(() => import('../record/LocationSheet'))

interface Props {
  sighting: Sighting
  /** 저장이 끝났거나 취소했을 때 — 읽는 화면으로 돌아간다 */
  onClose: () => void
  /** 삭제가 끝났을 때 — 이 기록은 이제 없으니 목록으로 */
  onDeleted: () => void
}

/**
 * 기록 고치기 — 새 이름 · 촬영 시각 · 위치 · 메모, 그리고 삭제. 기록 상세의 '수정'이 연다.
 * '수정'을 누를 때마다 새로 그려져 **그 순간의 기록**으로 칸을 채운다 — 화면을 열 때 한 번만 채우면 그 뒤 상세에서 AI가 붙인 이름을
 * 모른 채 옛 값으로 덮어쓴다 (작업 6). '취소'하면 고치던 값(위치 시트에서 고른 위치 포함)은 버려진다.
 * 저장은 바뀐 것만 넣는다 (editPatch). 촬영 시각을 읽을 수 없으면 저장을 막고, 저장·삭제가 실패하면 칸 안에 이유를 적고 머문다.
 */
export default function RecordEdit({ sighting: s, onClose, onDeleted }: Props) {
  const { sightings, update, remove } = useJournal()
  const [start] = useState(() => formOf(s))
  const [name, setName] = useState(start.name)
  const [time, setTime] = useState(start.time)
  const [note, setNote] = useState(start.note)
  const loc = usePlaceValue(start.place)
  const [pickingPlace, setPickingPlace] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState('')

  const patch = editPatch(s, { name, note, time, place: loc.place }, new Date())
  // 이동 기록에서 온 위치는 고치기 전 시각으로 찾은 것이다 — 시각만 고치면 둘이 어긋난다 (다시 찾지는 않는다 — WORK_ORDERS 작업 12)
  const staleTrack = patch?.capturedAt !== undefined && patch.locationSource === undefined && s.locationSource === 'tracklog'

  /** 바뀐 것을 저장하고 읽는 화면으로. 바뀐 것이 없으면 기록을 건드리지 않는다 — 그래도 쓰면 `updatedAt`이 바뀌어 "백업 안 된 기록"으로 세진다 */
  async function save() {
    if (!patch) return
    setError('')
    try {
      if (Object.keys(patch).length > 0) await update(s.id, patch)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했습니다.')
    }
  }

  /** 기록과 사진을 지우고 목록으로 */
  async function removeRecord() {
    setError('')
    try {
      await remove(s.id)
      onDeleted()
    } catch (e) {
      setError(e instanceof Error ? e.message : '삭제하지 못했습니다.')
    }
  }

  return (
    <>
      <Card>
        <label className="field"><span>새 이름</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
        {/* 이름을 고치면 근거를 떼는 것은 의도된 동작(editPatch)이지만, 말없이 지우면 안 된다 */}
        {s.verdict && name.trim() !== s.speciesKo && <p className="status-line is-warn">{EVIDENCE_LOSS_WARNING}</p>}
        {/* 촬영 시각: 사진에 시각이 없어 기록한 시각이 들어갔거나 카메라 시계가 틀렸을 때 고칠 유일한 길. 화면에 보이는 것과 같은 촬영지 시각이다 */}
        <label className="field"><span>촬영 시각</span><input type="datetime-local" value={time} onChange={(e) => setTime(e.target.value)} /></label>
        {!patch && <p className="status-line is-warn" role="alert">촬영 시각을 끝까지 채워 주세요.</p>}
        {/* 위치 줄: 위치가 없거나 틀린 기록을 고칠 유일한 길 — 기록 화면과 같은 한 줄, 같은 시트다 */}
        <div className="field"><span>위치</span><PlaceRow place={loc.place} onClick={() => setPickingPlace(true)} /></div>
        {staleTrack && <p className="status-line is-warn">이 위치는 고치기 전 시각으로 이동 기록에서 찾은 것입니다. 위치도 맞는지 봐 주세요.</p>}
        <label className="field"><span>메모</span><textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} /></label>
        <div className="row-actions">
          <Button variant="primary" icon="check" onClick={() => void save()} disabled={!patch}>저장</Button>
          {/* 닫기만 한다. 고치던 값은 버려지고, 다음 '수정'이 그때의 기록으로 다시 채운다 */}
          <Button variant="quiet" onClick={onClose}>취소</Button>
        </div>
        {error && <p className="status-line is-warn" role="alert">{error}</p>}
        <hr />
        {/* 삭제는 되돌릴 수 없다 — 한 번 더 묻는다. 대화 상자 대신 같은 자리에서 묻는다 */}
        {confirmDelete ? (
          <div className="row-actions">
            <Button variant="danger" icon="trash" onClick={() => void removeRecord()}>정말 삭제</Button>
            <Button variant="quiet" onClick={() => setConfirmDelete(false)}>그만두기</Button>
          </div>
        ) : <Button variant="danger" icon="trash" onClick={() => setConfirmDelete(true)}>이 기록 삭제</Button>}
      </Card>
      {pickingPlace && (
        // 받는 동안은 아무것도 그리지 않는다 — 대신 시트를 잠깐 그리면 시트가 둘 열렸다 닫힌 셈이라 뒤로가기 칸이 하나 헛칸으로 남는다 (app/nav.ts openLayer)
        <Suspense fallback={null}>
          {/* 직전 기록은 고치는 중인 시각 기준으로 고른다 — 시각을 먼저 고쳤으면 그 시각의 앞 기록이다 (placeBefore) */}
          <LocationSheet place={loc.place} error={loc.error} last={placeBefore(sightings ?? [], s.id, patch?.capturedAt ?? s.capturedAt)}
            onClose={() => setPickingPlace(false)} onPickOnMap={(lat, lng) => void loc.pickOnMap(lat, lng)} onUseCurrent={() => void loc.useCurrent()} onCopyLast={loc.copyFrom} />
        </Suspense>
      )}
    </>
  )
}
