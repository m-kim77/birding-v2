import { useState } from 'react'
import { useStore } from '../../app/store'
import { Banner, Card, Fact, ScreenHead } from '../../ui/bits'
import Button from '../../ui/Button'
import PhotoBox from '../../ui/PhotoBox'
import Sheet from '../../ui/Sheet'
import { formatDateTime } from '../../ui/format'
import type { LocationSource } from '../../types'
import BirdCard from '../dex/BirdCard'
import CardActions from '../dex/CardActions'

const SOURCE_LABEL: Record<LocationSource, string> = {
  exif: '사진 정보에서', tracklog: '이동 기록으로 추정', gps: '기록할 때의 현재 위치', manual: '직접 고름', none: '위치 없음',
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
  const { sightings, update, remove } = useStore()
  const s = sightings.find((x) => x.id === id)
  const [editing, setEditing] = useState(false)
  const [showCard, setShowCard] = useState(false)
  const [note, setNote] = useState(s?.note ?? '')
  const [name, setName] = useState(s?.speciesKo ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (!s) return <div className="screen"><ScreenHead title="기록을 찾을 수 없습니다" onBack={onBack} /></div>

  /** 고친 내용을 저장하고 읽기 화면으로 돌아간다 */
  function save() {
    update(id, { speciesKo: name.trim(), note })
    setEditing(false)
  }

  return (
    <div className="screen screen-detail">
      <ScreenHead title={s.speciesKo || '이름 미정'} sub={s.latin} onBack={onBack}
        right={!editing && <Button variant="quiet" icon="edit" onClick={() => setEditing(true)}>수정</Button>} />
      <div className="detail-cols">
        <PhotoBox src={s.photo} alt={s.speciesKo || '이름 미정'} sound={s.fromSound} />
        <div className="detail-side">
          {s.identify === 'waiting' && (
            <Banner tone="info" icon="sparkle">AI 판정을 기다리는 중입니다. 끝나면 이름이 채워집니다.</Banner>
          )}
          <Card>
            <Fact icon="clock">{formatDateTime(s.capturedAt)}</Fact>
            <Fact icon="pin" sub={SOURCE_LABEL[s.locationSource]}>{s.place}{s.sensitive && ' · 상세 위치 비공개'}</Fact>
            {s.exifLine && <Fact icon="aperture">{s.exifLine}</Fact>}
          </Card>
          {editing ? (
            <Card>
              <label className="field"><span>새 이름</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
              <label className="field"><span>메모</span><textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} /></label>
              <div className="row-actions">
                <Button variant="primary" icon="check" onClick={save}>저장</Button>
                <Button variant="quiet" onClick={() => setEditing(false)}>취소</Button>
              </div>
              <hr />
              {/* 삭제는 되돌릴 수 없다 — 한 번 더 묻는다. 대화 상자 대신 같은 자리에서 묻는다 */}
              {confirmDelete ? (
                <div className="row-actions">
                  <Button variant="danger" icon="trash" onClick={() => { remove(id); onBack() }}>정말 삭제</Button>
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
