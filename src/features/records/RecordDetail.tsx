import { useState } from 'react'
import { useBackLayer } from '../../app/useNav'
import { useJournal } from '../../data/journal'
import { expectsPhoto } from '../../data/photoKey'
import { protectionBy, protectionLine } from '../../data/protectedSpecies'
import { countText } from '../../lib/count'
import { Card, Fact, ScreenHead } from '../../ui/bits'
import Button from '../../ui/Button'
import SightingPhoto from '../../ui/SightingPhoto'
import Sheet from '../../ui/Sheet'
import { nameText, placeText, sourceText } from '../../ui/sightingText'
import { dateTimeOf } from '../../ui/when'
import BirdCard from '../dex/BirdCard'
import CardActions from '../dex/CardActions'
import CardStylePicker from '../dex/CardStylePicker'
import DetailIdentify from './DetailIdentify'
import HideLocationSwitch from './HideLocationSwitch'
import RecordEdit from './RecordEdit'
import { shotFact } from './shotEdit'
import VerdictDetails from '../identify/VerdictDetails'
import { verdictHeading } from '../identify/verdictText'
import './detail.css'

interface Props {
  id: string
  onBack: () => void
  /** 판정 서버가 쉴 때 "설정에서 내 키 넣기"가 가는 곳 */
  onOpenSettings: () => void
}

/**
 * 기록 상세. 읽는 화면이라 동작은 둘뿐이다 — 고치기('수정' → RecordEdit: 새 이름·촬영 시각·위치·개체 수·촬영 정보·메모, 그 안에 삭제)와 카드 보기.
 * 삭제를 이 화면에 꺼내 두지 않은 이유: 되돌릴 수 없는 동작이 읽는 화면의 엄지 닿는 곳에 있으면 안 된다.
 * 예외 하나: 보호종이고 위치가 있는 기록은 사실 카드에 위치 숨기기 스위치를 꺼내 둔다 (카드 보기 안의 것과 같은 스위치) — 사진 없이 기록은 저장 직후 화면을 거치지 않아 여기가 권유를 처음 보는 곳이다.
 * 사진 없이 남긴 기록(`noPhoto`)은 큰 사진 칸을 그리지 않는다 — 폰에서 화면 절반이 빈 상자가 된다. 사진을 전제로 하는 것(AI에게 물어보기,
 * '사진에 촬영 시각이 없어' 안내)은 사진이 있어야 하는 기록(expectsPhoto)에만 둔다. 카드 보기는 그대로 둔다 — 카드는 사진 없이 그린다.
 */
export default function RecordDetail({ id, onBack, onOpenSettings }: Props) {
  const { sightings } = useJournal()
  const s = (sightings ?? []).find((x) => x.id === id)
  const [editing, setEditing] = useState(false)
  const [showCard, setShowCard] = useState(false)
  // 수정 모드도 겹이다 — 폰의 뒤로가기가 화면을 떠나기 전에 수정부터 닫는다. 고치던 값은 저장하지 않는다 (다음 '수정'이 그때의 기록으로 다시 채운다 — RecordEdit)
  useBackLayer(editing, () => setEditing(false))

  if (!s) return <div className="screen"><ScreenHead title="기록을 찾을 수 없습니다" onBack={onBack} /></div>

  const photo = expectsPhoto(s)
  const counted = countText(s.count)
  const guarded = protectionLine(s.speciesKo)
  const shot = shotFact(s)
  return (
    <div className="screen screen-detail">
      <ScreenHead title={nameText(s.speciesKo)} sub={s.latin} onBack={onBack}
        right={!editing && <Button variant="quiet" icon="edit" onClick={() => setEditing(true)}>수정</Button>} />
      {/* 소리 기록은 지금처럼 자리 표시(소리 그림)를 그린다 — 사진 없이 남긴 기록만 칸을 뺀다 */}
      <div className={`detail-cols${s.noPhoto ? ' is-no-photo' : ''}`}>
        {!s.noPhoto && <SightingPhoto id={s.id} kind="full" alt={nameText(s.speciesKo)} ratio="3 / 2" sound={s.fromSound} />}
        <div className="detail-side">
          <Card>
            {/* 사진에 촬영 시각이 없으면 기록한 시각이 들어간다 — buildSighting이 capturedAt과 createdAt에 같은 값을 넣는다. 알려야 '수정'에서 고친다.
                사진 없는 기록의 시각은 사람이 적은 것이라 이 추정이 맞지 않는다 */}
            <Fact icon="clock" sub={photo && s.capturedAt === s.createdAt ? '사진에 촬영 시각이 없어 기록한 시각입니다' : undefined}>{dateTimeOf(s)}</Fact>
            {/* 위치가 없어도 줄을 그린다 — 없다는 것이 보여야 '수정'에서 채울 생각을 한다 */}
            <Fact icon="pin" sub={sourceText(s.locationSource)}>{placeText({ name: s.place, lat: s.lat, lng: s.lng })}</Fact>
            {/* 개체 수는 세었을 때만 — 안 셌으면 줄이 없다 (옛 기록 포함) */}
            {counted && <Fact icon="bird">{counted}</Fact>}
            {/* 보호종이면 법정 이름과 급 — 저장하지 않고 볼 때 국명으로 찾는다 (data/protectedSpecies.ts). 이름을 고치면 따라 바뀐다. 카드에는 급을 적지 않는다 */}
            {guarded && <Fact icon="bird" sub={protectionBy(s.speciesKo)}>{guarded}</Fact>}
            {/* 보호종이면 보호종 줄 바로 아래에 위치 숨기기 스위치(꺼져 있으면 권하는 한 줄까지) — 사진 없이 기록은 저장 직후 화면(CardResult)을 건너뛰고 곧장 여기로 와서,
                카드 보기를 열지 않으면 권유를 한 번도 못 본 채 핀이 지도에 올라간다. 켠 뒤에도 보인다 (끌 곳). 저절로 켜지 않는다. 위치가 없으면 스위치가 그리지 않는다.
                수정 중에는 뺀다 — 수정 칸의 '저장'과 따로 바로 저장되는 칸이 한 화면에 섞이지 않게 */}
            {guarded && !editing && <HideLocationSwitch sighting={s} />}
            {/* 카메라·렌즈만 있어도 줄을 그린다. 렌즈 이름과 '직접 고친' 표시는 아랫줄 — 고친 값이 사진에서 읽은 값처럼 보이면 안 된다 (shotFact) */}
            {shot && <Fact icon="aperture" sub={shot.sub}>{shot.main}</Fact>}
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
              {/* 저장한 뒤에도 물어볼 수 있다 — "나중에 기록을 열어 다시 물어볼 수 있습니다"(IdentifyPanel)가 사실이 되는 곳. 사진 없는 기록은 보낼 그림이 없다 */}
              {photo && <DetailIdentify sighting={s} onOpenSettings={onOpenSettings} />}
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
