import { useMemo, useRef, useState } from 'react'
import { useJournal } from '../../data/journal'
import { formatShot } from '../../lib/format'
import { Banner, Card, Fact, ScreenHead } from '../../ui/bits'
import Button from '../../ui/Button'
import Icon from '../../ui/Icon'
import { dateTimeOf } from '../../ui/when'
import type { NormalizedBox, Sighting } from '../../types'
import { buildSighting } from './buildSighting'
import CardResult from './CardResult'
import DetectView from './DetectView'
import IdentifyPanel from './IdentifyPanel'
import LocationSheet from './LocationSheet'
import SpeciesInput from './SpeciesInput'
import { imageForAI, makeCrop, savePhotos } from './savePhotos'
import { useAsk } from './useAsk'
import { useDetection } from './useDetection'
import { usePhotoPick } from './usePhotoPick'
import { SOURCE_LABEL, usePlace, type PlaceValue } from './usePlace'
import './record.css'

interface Props {
  onCancel: () => void
  onDone: (id: string) => void
}

/**
 * 사진으로 기록하기. 한 화면을 위에서 아래로 훑으면 끝난다 — 단계 이동(다음·이전) 버튼이 없다.
 * 사용자가 직접 적는 것은 이름과 메모뿐이고, 둘 다 비워도 저장된다. (뺀 버튼과 이유: ref_design/design_v01/BUTTONS.md)
 */
export default function RecordFlow({ onCancel, onDone }: Props) {
  const journal = useJournal()
  const existing = journal.sightings ?? []
  const picker = usePhotoPick()
  const photo = picker.photo
  const detection = useDetection(photo?.bitmap ?? null)
  const ask = useAsk()
  const loc = usePlace(photo?.exif ?? null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [crop, setCrop] = useState<{ box: NormalizedBox; by: string } | null>(null)
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [editingPlace, setEditingPlace] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saved, setSaved] = useState<Sighting | null>(null)

  // 새가 한 마리뿐이면 고를 것이 없으니 바로 그 상자를 쓴다
  const only = detection.boxes?.length === 1 ? detection.boxes[0] : null
  const picked = crop ?? (only ? { box: only, by: detection.detectorId } : null)
  const known = useMemo(() => [...new Set(existing.map((s) => s.speciesKo).filter(Boolean))], [existing])
  const lastPlace = useMemo<PlaceValue | null>(() => {
    const last = [...existing].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).find((s) => s.lat !== null)
    return last ? { lat: last.lat, lng: last.lng, name: last.place, source: 'manual' } : null
  }, [existing])

  /** AI에 물어본다. 고른 영역이 있으면 그 부분을, 없으면 사진 전체를 보낸다 (새를 못 찾았어도 자르지 않고 물어볼 수 있다) */
  async function askAI() {
    if (!photo) return
    void ask.start(await imageForAI(photo, picked?.box ?? null), { capturedAt: photo.exif.capturedAt, place: loc.place.name })
  }

  /** 사진과 기록을 저장하고 카드 화면으로 넘어간다. 실패하면 이유를 보여 주고 화면에 머문다 */
  async function save() {
    if (!photo) return
    setSaving(true)
    setSaveError('')
    try {
      const cut = picked ? await makeCrop(photo, picked.box) : null
      const sighting = buildSighting({ name, note, exif: photo.exif, place: loc.place, crop: cut && picked ? { box: cut.box, by: picked.by } : null, verdict: ask.verdict, existing, now: new Date() })
      await savePhotos(sighting.id, photo, cut?.blob ?? null)
      await journal.add(sighting)
      setSaved(sighting)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : '저장하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  if (saved) return <CardResult sighting={saved} onDone={() => onDone(saved.id)} />

  /**
   * 사진을 고르거나 바꾼다. **열기에 성공한 뒤에만** 이전 사진에 딸린 영역·판정을 비운다 — 실패하면 옛 사진이 그대로 남으므로 그것들도 남아야 한다.
   * 이름·메모는 사용자가 적은 것이라 남기고, 지도에서 직접 고른 위치도 남는다 (usePlace).
   */
  async function choose(f: File) {
    if (await picker.pick(f)) { setCrop(null); ask.cancel() }
  }
  const input = (
    // 사진 고르기 하나만 둔다: 폰에서는 운영체제가 "촬영 / 보관함"을 물어본다
    <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void choose(f); e.target.value = '' }} />
  )
  // 열기 실패 안내는 사진이 없을 때도, 바꾸다 실패했을 때도 같은 것을 쓴다
  const pickError = picker.error ? <Banner tone="err" icon="alert">{picker.error}</Banner> : null
  if (!photo) {
    return (
      <div className="screen">
        <ScreenHead title="새 기록" onBack={onCancel} />
        {input}
        <button type="button" className="photo-drop" onClick={() => fileInput.current?.click()}>
          <Icon name="camera" size={40} /><strong>사진 고르기</strong><span>시각·위치·촬영 정보는 사진에서 자동으로 읽습니다</span>
        </button>
        {pickError}
      </div>
    )
  }

  const when = photo.exif.capturedAt ? dateTimeOf({ capturedAt: photo.exif.capturedAt, capturedAtOffset: photo.exif.capturedAtOffset ?? null }) : '촬영 시각 없음 — 지금 시각으로 기록'
  const shot = formatShot({ focal_length: photo.exif.focalLength, f_number: photo.exif.fNumber, exposure_time: photo.exif.exposureTime, iso: photo.exif.iso })
  return (
    <div className="screen screen-record">
      {/* 사진 바꾸기: 잘못 고른 사진을 바꾸는 유일한 길 — 없으면 기록을 통째로 버리고 다시 시작해야 한다 */}
      <ScreenHead title="새 기록" onBack={onCancel} right={<Button variant="quiet" icon="camera" onClick={() => fileInput.current?.click()}>사진 바꾸기</Button>} />
      {input}
      <div className="record-cols">
        <DetectView photoUrl={photo.url} ratio={`${photo.size.width} / ${photo.size.height}`} detection={detection} picked={picked?.box ?? null} onPick={(box, by) => setCrop({ box, by: by === 'manual' ? 'manual' : detection.detectorId })} />
        <div className="record-side">
          <Card>
            <Fact icon="clock">{when}</Fact>
            {/* 위치 줄 전체가 버튼이다 — 없거나 틀렸을 때만 누른다 */}
            <button type="button" className="fact-button" onClick={() => setEditingPlace(true)}>
              <Fact icon="pin" sub={SOURCE_LABEL[loc.place.source]}>{loc.place.name || (loc.place.lat !== null ? `${loc.place.lat.toFixed(4)}, ${loc.place.lng!.toFixed(4)}` : '위치 없음')}</Fact>
              <Icon name="chevron" size={18} />
            </button>
            {shot && <Fact icon="aperture">{shot}</Fact>}
          </Card>
          <Card>
            <SpeciesInput value={name} known={known} onChange={setName} />
            <IdentifyPanel ask={ask} hasCrop={picked !== null} name={name} onAsk={() => void askAI()} onApply={(v) => setName(v.speciesKo || v.latin)} />
          </Card>
          <Card>
            <label className="field"><span>메모</span>
              <textarea rows={3} placeholder="행동, 개체 수, 날씨 — 기억하고 싶은 것" value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
          </Card>
          {pickError}
          {saveError && <Banner tone="err" icon="alert">{saveError}</Banner>}
        </div>
      </div>
      <div className="bottom-bar">
        <Button variant="primary" icon="check" block onClick={() => void save()} disabled={saving}>{saving ? '저장하는 중…' : name.trim() ? '저장' : '이름 없이 저장'}</Button>
      </div>
      {editingPlace && (
        <LocationSheet place={loc.place} error={loc.error} last={lastPlace} onClose={() => setEditingPlace(false)}
          onPickOnMap={(lat, lng) => void loc.pickOnMap(lat, lng)} onUseCurrent={() => void loc.useCurrent()} onCopyLast={loc.copyFrom} />
      )}
    </div>
  )
}
