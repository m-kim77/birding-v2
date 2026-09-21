import { useState } from 'react'
import { useStore } from '../../app/store'
import { PICKED_PHOTO } from '../../mock/data'
import { Card, Fact, ScreenHead } from '../../ui/bits'
import Button from '../../ui/Button'
import Icon from '../../ui/Icon'
import { formatDateTime } from '../../ui/format'
import type { Sighting } from '../../types'
import { tierFor } from '../dex/cardTier'
import CardResult from './CardResult'
import DetectView from './DetectView'
import IdentifyPanel from './IdentifyPanel'
import LocationSheet from './LocationSheet'
import SpeciesInput from './SpeciesInput'
import { useRecordDraft } from './useRecordDraft'
import './record.css'

interface Props {
  onCancel: () => void
  onDone: (id: string) => void
}

/**
 * 사진으로 기록하기. 한 화면을 위에서 아래로 훑으면 끝난다 — 단계 이동(다음·이전) 버튼이 없다.
 *
 * v1 기록 화면에서 뺀 것: 카메라/갤러리 버튼 분리(운영체제의 선택 창이 둘 다 준다), "새 찾기" 버튼(자동 실행),
 * 탐지 모델·방식 선택, 위치 버튼 3개(위치 시트 안으로), 판정 provider·모델·호출 수·시간 제한 입력.
 * 사용자가 직접 적는 것은 이름과 메모뿐이고, 둘 다 비워도 저장된다.
 */
export default function RecordFlow({ onCancel, onDone }: Props) {
  const store = useStore()
  const draft = useRecordDraft(store.scenario)
  const [place, setPlace] = useState(PICKED_PHOTO.place)
  const [placeNote, setPlaceNote] = useState(PICKED_PHOTO.locationNote)
  const [editingPlace, setEditingPlace] = useState(false)
  const [saved, setSaved] = useState<Sighting | null>(null)

  /** 기록을 저장하고 카드 화면으로 넘어간다. 판정이 아직 안 끝났으면 "판정 대기"로 저장된다 */
  function save() {
    const name = draft.name.trim()
    const pending = !name && (draft.ask === 'running' || draft.ask === 'server-down')
    const sighting: Sighting = {
      id: `s${Date.now()}`, speciesKo: name, latin: name ? draft.latin : '', capturedAt: PICKED_PHOTO.capturedAt,
      place, lat: 37.571, lng: 127.035, locationSource: PICKED_PHOTO.locationSource, exifLine: PICKED_PHOTO.exifLine,
      note: draft.note, photo: PICKED_PHOTO.src, stamps: [], sensitive: false, fromSound: false,
      tier: tierFor(name, PICKED_PHOTO.capturedAt, [], store.sightings),
      identify: pending ? 'waiting' : name ? 'done' : 'none',
    }
    store.add(sighting)
    setSaved(sighting)
  }

  if (saved) return <CardResult sighting={saved} onDone={() => onDone(saved.id)} />

  if (!draft.hasPhoto) {
    return (
      <div className="screen">
        <ScreenHead title="새 기록" onBack={onCancel} />
        {/* 사진 고르기 하나만 둔다: 폰에서는 운영체제가 "촬영 / 보관함"을 물어본다 */}
        <button type="button" className="photo-drop" onClick={draft.pickPhoto}>
          <Icon name="camera" size={40} />
          <strong>사진 고르기</strong>
          <span>시각·위치·촬영 정보는 사진에서 자동으로 읽습니다</span>
        </button>
      </div>
    )
  }

  return (
    <div className="screen screen-record">
      <ScreenHead title="새 기록" onBack={onCancel} />
      <div className="record-cols">
        <DetectView draft={draft} />
        <div className="record-side">
          <Card>
            <Fact icon="clock">{formatDateTime(PICKED_PHOTO.capturedAt)}</Fact>
            {/* 위치 줄 전체가 버튼이다 — 틀렸을 때만 누른다 */}
            <button type="button" className="fact-button" onClick={() => setEditingPlace(true)}>
              <Fact icon="pin" sub={placeNote}>{place}</Fact><Icon name="chevron" size={18} />
            </button>
            <Fact icon="aperture">{PICKED_PHOTO.exifLine}</Fact>
          </Card>
          <Card>
            <SpeciesInput value={draft.name} onChange={draft.setName} />
            <IdentifyPanel draft={draft} />
          </Card>
          <Card>
            <label className="field"><span>메모</span>
              <textarea rows={3} placeholder="행동, 개체 수, 날씨 — 기억하고 싶은 것" value={draft.note} onChange={(e) => draft.setNote(e.target.value)} />
            </label>
          </Card>
        </div>
      </div>
      <div className="bottom-bar">
        <Button variant="primary" icon="check" block onClick={save}>{draft.name.trim() ? '저장' : '이름 없이 저장'}</Button>
      </div>
      {editingPlace && (
        <LocationSheet place={place} onClose={() => setEditingPlace(false)}
          onPick={(p, n) => { setPlace(p); setPlaceNote(n); setEditingPlace(false) }} />
      )}
    </div>
  )
}
