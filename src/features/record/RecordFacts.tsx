import { formatShot } from '../../lib/format'
import { Card, Fact } from '../../ui/bits'
import Icon from '../../ui/Icon'
import { dateTimeOf } from '../../ui/when'
import { SOURCE_LABEL, type PlaceValue } from './usePlace'
import type { PickedPhoto } from './usePhotoPick'

/**
 * 사진에서 자동으로 읽은 것(시각·촬영 정보)과 위치 한 줄. 위치 줄 전체가 버튼이다 — 없거나 틀렸을 때만 누른다.
 * 그리기만 한다. 값은 RecordFlow가 든다.
 */
export function FactsCard({ photo, place, onEditPlace }: { photo: PickedPhoto; place: PlaceValue; onEditPlace: () => void }) {
  const when = photo.exif.capturedAt ? dateTimeOf({ capturedAt: photo.exif.capturedAt, capturedAtOffset: photo.exif.capturedAtOffset ?? null }) : '촬영 시각 없음 — 지금 시각으로 기록'
  const shot = formatShot({ focal_length: photo.exif.focalLength, f_number: photo.exif.fNumber, exposure_time: photo.exif.exposureTime, iso: photo.exif.iso })
  return (
    <Card>
      <Fact icon="clock">{when}</Fact>
      <button type="button" className="fact-button" onClick={onEditPlace}>
        <Fact icon="pin" sub={SOURCE_LABEL[place.source]}>{place.name || (place.lat !== null ? `${place.lat.toFixed(4)}, ${place.lng!.toFixed(4)}` : '위치 없음')}</Fact>
        <Icon name="chevron" size={18} />
      </button>
      {shot && <Fact icon="aperture">{shot}</Fact>}
    </Card>
  )
}

/** 메모 칸. 비워도 된다 */
export function NoteCard({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Card>
      <label className="field"><span>메모</span>
        <textarea rows={3} placeholder="행동, 개체 수, 날씨 — 기억하고 싶은 것" value={value} onChange={(e) => onChange(e.target.value)} />
      </label>
    </Card>
  )
}
