import { useState } from 'react'
import { useBackLayer } from '../../app/useNav'
import { useJournal } from '../../data/journal'
import { formatShot } from '../../lib/format'
import { Card, Fact, ScreenHead } from '../../ui/bits'
import Button from '../../ui/Button'
import SightingPhoto from '../../ui/SightingPhoto'
import Sheet from '../../ui/Sheet'
import { dateTimeOf } from '../../ui/when'
import type { LocationSource } from '../../types'
import BirdCard from '../dex/BirdCard'
import CardActions from '../dex/CardActions'
import CardStylePicker from '../dex/CardStylePicker'
import DetailIdentify from './DetailIdentify'
import HideLocationSwitch from './HideLocationSwitch'
import RecordEdit from './RecordEdit'
import VerdictDetails from '../identify/VerdictDetails'
import { verdictHeading } from '../identify/verdictText'

const SOURCE_LABEL: Record<LocationSource, string> = {
  exif: '사진 정보에서', tracklog: '이동 기록으로 추정', gps: '기록할 때의 현재 위치', manual: '지도에서 직접 고름', none: '',
}

interface Props {
  id: string
  onBack: () => void
  /** 판정 서버가 쉴 때 "설정에서 내 키 넣기"가 가는 곳 */
  onOpenSettings: () => void
}

/**
 * 기록 상세. 읽는 화면이라 동작은 둘뿐이다 — 고치기('수정' → RecordEdit: 새 이름·촬영 시각·위치·메모, 그 안에 삭제)와 카드 보기.
 * 삭제를 이 화면에 꺼내 두지 않은 이유: 되돌릴 수 없는 동작이 읽는 화면의 엄지 닿는 곳에 있으면 안 된다.
 */
export default function RecordDetail({ id, onBack, onOpenSettings }: Props) {
  const { sightings } = useJournal()
  const s = (sightings ?? []).find((x) => x.id === id)
  const [editing, setEditing] = useState(false)
  const [showCard, setShowCard] = useState(false)
  // 수정 모드도 겹이다 — 폰의 뒤로가기가 화면을 떠나기 전에 수정부터 닫는다. 고치던 값은 저장하지 않는다 (다음 '수정'이 그때의 기록으로 다시 채운다 — RecordEdit)
  useBackLayer(editing, () => setEditing(false))

  if (!s) return <div className="screen"><ScreenHead title="기록을 찾을 수 없습니다" onBack={onBack} /></div>

  const shot = formatShot({ focal_length: s.shot.focalLength, f_number: s.shot.fNumber, exposure_time: s.shot.exposureTime, iso: s.shot.iso })
  return (
    <div className="screen screen-detail">
      <ScreenHead title={s.speciesKo || '이름 미정'} sub={s.latin} onBack={onBack}
        right={!editing && <Button variant="quiet" icon="edit" onClick={() => setEditing(true)}>수정</Button>} />
      <div className="detail-cols">
        <SightingPhoto id={s.id} kind="full" alt={s.speciesKo || '이름 미정'} ratio="3 / 2" sound={s.fromSound} />
        <div className="detail-side">
          <Card>
            {/* 사진에 촬영 시각이 없으면 기록한 시각이 들어간다 — buildSighting이 capturedAt과 createdAt에 같은 값을 넣는다. 알려야 '수정'에서 고친다 */}
            <Fact icon="clock" sub={s.capturedAt === s.createdAt ? '사진에 촬영 시각이 없어 기록한 시각입니다' : undefined}>{dateTimeOf(s)}</Fact>
            {/* 위치가 없어도 줄을 그린다 — 없다는 것이 보여야 '수정'에서 채울 생각을 한다 */}
            <Fact icon="pin" sub={SOURCE_LABEL[s.locationSource]}>{s.place || (s.lat !== null ? `${s.lat.toFixed(4)}, ${s.lng!.toFixed(4)}` : '위치 없음')}</Fact>
            {shot && <Fact icon="aperture">{[s.shot.cameraModel, shot].filter(Boolean).join(' · ')}</Fact>}
          </Card>
          {editing ? (
            // '수정'을 누를 때마다 새로 그려져 그때의 기록으로 칸을 채운다 — 취소하면 고치던 값은 버려진다
            <RecordEdit sighting={s} onClose={() => setEditing(false)} onDeleted={onBack} />
          ) : (
            <>
              {s.note && <Card><p className="note">{s.note}</p></Card>}
              {s.verdict && (
                <Card>
                  <h2>{verdictHeading(s.verdict.kind)}</h2>
                  <p className="note">{s.verdict.summary}</p>
                  <VerdictDetails verdict={s.verdict} />
                </Card>
              )}
              {/* 저장한 뒤에도 물어볼 수 있다 — "나중에 기록을 열어 다시 물어볼 수 있습니다"(IdentifyPanel)가 사실이 되는 곳 */}
              {!s.fromSound && <DetailIdentify sighting={s} onOpenSettings={onOpenSettings} />}
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
          <CardStylePicker sighting={s} />
          <HideLocationSwitch sighting={s} />
          <CardActions sighting={s} />
        </Sheet>
      )}
    </div>
  )
}
