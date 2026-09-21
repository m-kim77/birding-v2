import { useState } from 'react'
import { useJournal } from '../../data/journal'
import { latinOf } from '../../data/species'
import { formatShot } from '../../lib/format'
import { Card, Fact, ScreenHead } from '../../ui/bits'
import Button from '../../ui/Button'
import SightingPhoto from '../../ui/SightingPhoto'
import Sheet from '../../ui/Sheet'
import { dateTimeOf } from '../../ui/when'
import type { LocationSource } from '../../types'
import BirdCard from '../dex/BirdCard'
import CardActions from '../dex/CardActions'

const SOURCE_LABEL: Record<LocationSource, string> = {
  exif: '사진 정보에서', tracklog: '이동 기록으로 추정', gps: '기록할 때의 현재 위치', manual: '지도에서 직접 고름', none: '',
}

interface Props {
  id: string
  onBack: () => void
}

/**
 * 기록 상세. 읽는 화면이라 동작은 둘뿐이다 — 고치기(수정 안에 삭제가 있다)와 카드 보기.
 * 삭제를 이 화면에 꺼내 두지 않은 이유: 되돌릴 수 없는 동작이 읽는 화면의 엄지 닿는 곳에 있으면 안 된다.
 */
export default function RecordDetail({ id, onBack }: Props) {
  const { sightings, update, remove } = useJournal()
  const s = (sightings ?? []).find((x) => x.id === id)
  const [editing, setEditing] = useState(false)
  const [showCard, setShowCard] = useState(false)
  const [note, setNote] = useState(s?.note ?? '')
  const [name, setName] = useState(s?.speciesKo ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (!s) return <div className="screen"><ScreenHead title="기록을 찾을 수 없습니다" onBack={onBack} /></div>

  /** 고친 내용을 저장하고 읽기 화면으로 돌아간다 */
  async function save() {
    const next = name.trim()
    // 이름을 고쳤으면 학명도 다시 맞춘다. AI 근거는 그 이름에 대한 것이므로 이름이 바뀌면 뗀다
    const renamed = next !== s!.speciesKo
    await update(id, { speciesKo: next, note, ...(renamed ? { latin: latinOf(next), verdict: undefined, identify: next ? 'done' as const : 'none' as const } : {}) })
    setEditing(false)
  }

  const shot = formatShot({ focal_length: s.shot.focalLength, f_number: s.shot.fNumber, exposure_time: s.shot.exposureTime, iso: s.shot.iso })
  return (
    <div className="screen screen-detail">
      <ScreenHead title={s.speciesKo || '이름 미정'} sub={s.latin} onBack={onBack}
        right={!editing && <Button variant="quiet" icon="edit" onClick={() => setEditing(true)}>수정</Button>} />
      <div className="detail-cols">
        <SightingPhoto id={s.id} kind="full" alt={s.speciesKo || '이름 미정'} ratio="3 / 2" sound={s.fromSound} />
        <div className="detail-side">
          <Card>
            <Fact icon="clock">{dateTimeOf(s)}</Fact>
            {(s.place || s.lat !== null) && <Fact icon="pin" sub={SOURCE_LABEL[s.locationSource]}>{s.place || `${s.lat!.toFixed(4)}, ${s.lng!.toFixed(4)}`}</Fact>}
            {shot && <Fact icon="aperture">{[s.shot.cameraModel, shot].filter(Boolean).join(' · ')}</Fact>}
          </Card>
          {editing ? (
            <Card>
              <label className="field"><span>새 이름</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
              <label className="field"><span>메모</span><textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} /></label>
              <div className="row-actions">
                <Button variant="primary" icon="check" onClick={() => void save()}>저장</Button>
                <Button variant="quiet" onClick={() => setEditing(false)}>취소</Button>
              </div>
              <hr />
              {/* 삭제는 되돌릴 수 없다 — 한 번 더 묻는다. 대화 상자 대신 같은 자리에서 묻는다 */}
              {confirmDelete ? (
                <div className="row-actions">
                  <Button variant="danger" icon="trash" onClick={() => void remove(id).then(onBack)}>정말 삭제</Button>
                  <Button variant="quiet" onClick={() => setConfirmDelete(false)}>그만두기</Button>
                </div>
              ) : <Button variant="danger" icon="trash" onClick={() => setConfirmDelete(true)}>이 기록 삭제</Button>}
            </Card>
          ) : (
            <>
              {s.note && <Card><p className="note">{s.note}</p></Card>}
              {s.verdict && (
                <Card>
                  <details className="evidence">
                    <summary>AI 판정 근거 {s.verdict.evidence.length}개</summary>
                    <p>{s.verdict.summary}</p>
                    <ul>{s.verdict.evidence.map((e) => <li key={e.text}>{e.text}<small>{e.source}</small></li>)}</ul>
                  </details>
                </Card>
              )}
              <button type="button" className="card-peek" onClick={() => setShowCard(true)} aria-label="카드 크게 보기">
                <BirdCard sighting={s} small />
                <span>이 기록의 카드 보기</span>
              </button>
            </>
          )}
        </div>
      </div>
      {showCard && (
        <Sheet title="새 카드" onClose={() => setShowCard(false)}>
          <BirdCard sighting={s} />
          <CardActions sighting={s} />
        </Sheet>
      )}
    </div>
  )
}
