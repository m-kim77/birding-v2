import { isBadCount } from '../../lib/count'
import { formatShot } from '../../lib/format'
import { Card, Fact } from '../../ui/bits'
import Icon from '../../ui/Icon'
import { placeText, sourceText } from '../../ui/sightingText'
import { dateTimeOf } from '../../ui/when'
import type { PlaceValue } from './usePlace'
import type { PickedPhoto } from './usePhotoPick'

/**
 * 사진에서 자동으로 읽은 것(시각·촬영 정보)과 위치 한 줄. 위치 줄 전체가 버튼이다 — 없거나 틀렸을 때만 누른다.
 * placeNote는 출처 옆에 붙는 근거(이동 기록의 앞뒤 점 간격), placeHint는 위치 줄 아래 안내(이동 기록에서 못 찾은 이유).
 * 그리기만 한다. 값은 RecordFlow가 든다.
 */
export function FactsCard({ photo, place, placeNote, placeHint, onEditPlace }: { photo: PickedPhoto; place: PlaceValue; placeNote?: string; placeHint?: string; onEditPlace: () => void }) {
  const when = photo.exif.capturedAt ? dateTimeOf({ capturedAt: photo.exif.capturedAt, capturedAtOffset: photo.exif.capturedAtOffset ?? null }) : '촬영 시각 없음 — 지금 시각으로 기록'
  const shot = formatShot({ focal_length: photo.exif.focalLength, f_number: photo.exif.fNumber, exposure_time: photo.exif.exposureTime, iso: photo.exif.iso })
  return (
    <Card>
      <Fact icon="clock">{when}</Fact>
      <PlaceRow place={place} note={placeNote} onClick={onEditPlace} />
      {placeHint && <p className="hint">{placeHint}</p>}
      {shot && <Fact icon="aperture">{shot}</Fact>}
    </Card>
  )
}

/**
 * 위치 한 줄 — 줄 전체가 위치 시트를 여는 버튼이다. 없거나 틀렸을 때만 누른다.
 * 기록 화면(FactsCard)·사진 없이 기록(QuickRecord)·저장한 기록의 수정 칸(records/RecordEdit)이 같이 쓴다. `note`는 출처 옆에 붙는 근거(이동 기록의 앞뒤 점 간격).
 */
export function PlaceRow({ place, note, onClick }: { place: PlaceValue; note?: string; onClick: () => void }) {
  const sub = [sourceText(place.source, '위치 없음 — 눌러서 고르기'), note].filter(Boolean).join(' · ')
  return (
    <button type="button" className="fact-button" onClick={onClick}>
      <Fact icon="pin" sub={sub}>{placeText(place)}</Fact>
      <Icon name="chevron" size={18} />
    </button>
  )
}

/**
 * 개체 수 칸. 비워도 된다 — 비우면 '세지 않음'. 1 이상의 정수가 아닌 값을 적으면 칸 밑에 알린다 — 그대로 저장하면 개체 수 없이 저장된다 (lib/count.ts).
 * 새 기록의 메모 카드(NoteCard)·사진 없이 기록(QuickRecord)·저장한 기록의 수정 칸(records/RecordEdit)이 같이 쓴다. 어림·범위는 메모에 적는다.
 * 글자 칸(type=text)이다 — type=number는 숫자로 못 읽는 글자('10-20'·'3마리')를 빈 값으로 돌려줘 경고 없이 '세지 않음'이 되고
 * (수정에서는 저장된 개체 수가 말없이 지워진다), PC에서 휠로 값이 바뀐다 (records/ShotFields의 ShotInput과 같은 이유).
 */
export function CountField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <>
      <label className="field"><span>개체 수</span>
        <input type="text" inputMode="numeric" placeholder="세지 않았으면 비워 두세요" value={value} onChange={(e) => onChange(e.target.value)} />
      </label>
      {isBadCount(value) && <p className="status-line is-warn" role="alert">개체 수는 1 이상의 정수로 적어 주세요. 이대로 저장하면 개체 수 없이 저장됩니다 — 어림·범위는 메모에.</p>}
    </>
  )
}

/** 개체 수와 메모 칸. 둘 다 비워도 된다 */
export function NoteCard({ value, onChange, count, onCount }: { value: string; onChange: (v: string) => void; count: string; onCount: (v: string) => void }) {
  return (
    <Card>
      <CountField value={count} onChange={onCount} />
      <label className="field"><span>메모</span>
        <textarea rows={3} placeholder="행동, 날씨 — 기억하고 싶은 것" value={value} onChange={(e) => onChange(e.target.value)} />
      </label>
    </Card>
  )
}
