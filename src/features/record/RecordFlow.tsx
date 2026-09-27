import { useMemo, useRef, useState } from 'react'
import { useJournal } from '../../data/journal'
import { Banner, Card, ScreenHead } from '../../ui/bits'
import Button from '../../ui/Button'
import type { NormalizedBox, Sighting } from '../../types'
import { accentFromImage } from '../dex/accentFromPhoto'
import { styleFromAccent } from '../dex/cardStyle'
import { isFirstMeet } from '../dex/dexNo'
import { buildSighting } from './buildSighting'
import CardResult from './CardResult'
import DetectView from './DetectView'
import IdentifyPanel from './IdentifyPanel'
import LocationSheet from './LocationSheet'
import { acceptsVerdict } from './nameFields'
import PhotoStart from './PhotoStart'
import { FactsCard, NoteCard } from './RecordFacts'
import SpeciesInput from './SpeciesInput'
import { imageForAI, makeCrop, makePhotos } from './savePhotos'
import { useAsk } from './useAsk'
import { useDetection } from './useDetection'
import { usePhotoPick } from './usePhotoPick'
import { useRecordFields } from './useRecordFields'
import { useRecordPlace } from './useRecordPlace'
import './record.css'

interface Props {
  onCancel: () => void
  onDone: (id: string) => void
  /** 기본 제공 AI가 쉴 때 "설정에서 내 키 넣기"가 가는 곳 */
  onOpenSettings: () => void
}

/** 상자 둘이 같은 영역인지 (참조가 아니라 값으로) */
const sameBox = (a: NormalizedBox | null, b: NormalizedBox | null) => JSON.stringify(a) === JSON.stringify(b)

/**
 * 사진으로 기록하기. 한 화면을 위에서 아래로 훑으면 끝난다 — 단계 이동(다음·이전) 버튼이 없다.
 * 사용자가 직접 적는 것은 이름과 메모뿐이고, 둘 다 비워도 저장된다. (뺀 버튼과 이유: ref_design/design_v01/BUTTONS.md)
 * 쓰던 것은 초안으로 남는다 — 뒤로 가거나 설정에 다녀와도 다음에 "이어 쓰기"로 돌아온다 (useRecordFields).
 */
export default function RecordFlow({ onCancel, onDone, onOpenSettings }: Props) {
  const journal = useJournal()
  const existing = journal.sightings ?? []
  const picker = usePhotoPick()
  const photo = picker.photo
  const detection = useDetection(photo?.bitmap ?? null)
  const ask = useAsk()
  const { loc, lastPlace, placeNote, placeHint } = useRecordPlace(photo, existing)
  const [saved, setSaved] = useState<{ sighting: Sighting; firstMeet: boolean } | null>(null)
  // 위치 훅 뒤에 부른다 — 되살린 위치가 사진 좌표에 밀리지 않게 (useRecordFields 머리말)
  const { draft, crop, setCrop, name, setName, note, setNote, askedBox, setAskedBox, choose, resume } = useRecordFields({ picker, loc, ask, saved: saved !== null })
  const fileInput = useRef<HTMLInputElement>(null)
  const [editingPlace, setEditingPlace] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  // 새가 한 마리뿐이면 고를 것이 없으니 바로 그 상자를 쓴다
  const only = detection.boxes?.length === 1 ? detection.boxes[0] : null
  const picked = crop ?? (only ? { box: only, by: detection.detectorId } : null)
  const known = useMemo(() => [...new Set(existing.map((s) => s.speciesKo).filter(Boolean))], [existing])

  /** AI에 물어본다. 고른 영역이 있으면 그 부분을, 없으면 사진 전체를 보낸다 (새를 못 찾았어도 자르지 않고 물어볼 수 있다) */
  async function askAI() {
    if (!photo) return
    setAskedBox(picked?.box ?? null)
    void ask.start(await imageForAI(photo, picked?.box ?? null), { capturedAt: photo.exif.capturedAt, place: loc.place.name })
  }

  /**
   * 사진과 기록을 저장하고 카드 화면으로 넘어간다. 실패하면 이유를 보여 주고 화면에 머문다 (초안도 남는다).
   * 카드 색은 잘라낸 사진(없으면 사진 전체)에서 뽑는다 — 못 뽑으면 기본색. "처음 본 종"은 더하기 전의 목록으로 판단한다.
   */
  async function save() {
    if (!photo) return
    setSaving(true)
    setSaveError('')
    try {
      const cut = picked ? await makeCrop(photo, picked.box) : null
      // 자른 영역이 없으면(모델을 안 받았거나 새를 못 찾았거나 여러 마리 중 안 골랐으면) 사진 전체에서 뽑는다 — imageForAI·getBestPhoto와 같은 규칙
      const cardStyle = styleFromAccent(await accentFromImage(cut?.blob ?? photo.bitmap))
      const sighting = buildSighting({ name, note, exif: photo.exif, place: loc.place, crop: cut && picked ? { box: cut.box, by: picked.by } : null, verdict: ask.verdict, cardStyle, now: new Date() })
      // 사진을 다 만든 뒤 기록과 함께 한 번에 쓴다 — 끊겨도 반쪽(사진만·기록만)이 남지 않는다
      await journal.add(sighting, await makePhotos(photo, cut?.blob ?? null))
      setSaved({ sighting, firstMeet: isFirstMeet(sighting.speciesKo, existing) })
      // 기록이 됐으니 초안은 할 일을 다했다. 실패한 저장은 초안을 남긴다
      void draft.clear()
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : '저장하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  if (saved) return <CardResult sighting={saved.sighting} firstMeet={saved.firstMeet} onDone={() => onDone(saved.sighting.id)} />

  const input = (
    // 사진 고르기 하나만 둔다: 폰에서는 운영체제가 "촬영 / 보관함"을 물어본다
    <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void choose(f); e.target.value = '' }} />
  )
  // 열기 실패 안내는 사진이 없을 때도, 바꾸다 실패했을 때도 같은 것을 쓴다
  const pickError = picker.error ? <Banner tone="err" icon="alert">{picker.error}</Banner> : null
  if (!photo) {
    return <PhotoStart onBack={onCancel} onPick={() => fileInput.current?.click()} input={input} draft={draft.pending}
      onResume={() => void resume()} onDiscard={() => void draft.clear()} error={pickError} />
  }

  return (
    <div className="screen screen-record">
      {/* 사진 바꾸기: 잘못 고른 사진을 바꾸는 유일한 길 — 없으면 기록을 통째로 버리고 다시 시작해야 한다 */}
      <ScreenHead title="새 기록" onBack={onCancel} right={<Button variant="quiet" icon="camera" onClick={() => fileInput.current?.click()}>사진 바꾸기</Button>} />
      {input}
      <div className="record-cols">
        <DetectView photoUrl={photo.url} ratio={`${photo.size.width} / ${photo.size.height}`} detection={detection} picked={picked?.box ?? null} onPick={(box, by) => setCrop({ box, by: by === 'manual' ? 'manual' : detection.detectorId })} />
        <div className="record-side">
          <FactsCard photo={photo} place={loc.place} placeNote={placeNote} placeHint={placeHint} onEditPlace={() => setEditingPlace(true)} />
          <Card>
            <SpeciesInput value={name} known={known} onChange={setName} />
            <IdentifyPanel ask={ask} hasCrop={picked !== null} cropChanged={ask.state === 'done' && !sameBox(askedBox, picked?.box ?? null)} name={name} applied={acceptsVerdict(name, ask.verdict)}
              onAsk={() => void askAI()} onApply={(v) => setName(v.speciesKo)} onPickName={setName} onOpenSettings={onOpenSettings} />
          </Card>
          <NoteCard value={note} onChange={setNote} />
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
