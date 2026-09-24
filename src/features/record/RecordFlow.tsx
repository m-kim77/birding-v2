import { useEffect, useMemo, useRef, useState } from 'react'
import { useJournal } from '../../data/journal'
import type { Draft } from '../../data/draft'
import { Banner, Card, ScreenHead } from '../../ui/bits'
import Button from '../../ui/Button'
import Icon from '../../ui/Icon'
import type { NormalizedBox, Sighting } from '../../types'
import { accentFromImage } from '../dex/accentFromPhoto'
import { styleFromAccent } from '../dex/cardStyle'
import { isFirstMeet } from '../dex/dexNo'
import { buildSighting } from './buildSighting'
import CardResult from './CardResult'
import DetectView from './DetectView'
import DraftNotice from './DraftNotice'
import IdentifyPanel from './IdentifyPanel'
import LocationSheet from './LocationSheet'
import { FactsCard, NoteCard } from './RecordFacts'
import SpeciesInput from './SpeciesInput'
import { imageForAI, makeCrop, savePhotos } from './savePhotos'
import { useAsk } from './useAsk'
import { useDetection } from './useDetection'
import { useDraft } from './useDraft'
import { usePhotoPick } from './usePhotoPick'
import { usePlace, type PlaceValue } from './usePlace'
import './record.css'

interface Props {
  onCancel: () => void
  onDone: (id: string) => void
  /** 기본 제공 AI가 쉴 때 "설정에서 내 키 넣기"가 가는 곳 */
  onOpenSettings: () => void
}

type Crop = { box: NormalizedBox; by: string }
/** 상자 둘이 같은 영역인지 (참조가 아니라 값으로) */
const sameBox = (a: NormalizedBox | null, b: NormalizedBox | null) => JSON.stringify(a) === JSON.stringify(b)

/**
 * 사진으로 기록하기. 한 화면을 위에서 아래로 훑으면 끝난다 — 단계 이동(다음·이전) 버튼이 없다.
 * 사용자가 직접 적는 것은 이름과 메모뿐이고, 둘 다 비워도 저장된다. (뺀 버튼과 이유: ref_design/design_v01/BUTTONS.md)
 * 쓰던 것은 초안으로 남는다 — 뒤로 가거나 설정에 다녀와도 다음에 "이어 쓰기"로 돌아온다 (useDraft).
 */
export default function RecordFlow({ onCancel, onDone, onOpenSettings }: Props) {
  const journal = useJournal()
  const existing = journal.sightings ?? []
  const picker = usePhotoPick()
  const photo = picker.photo
  const detection = useDetection(photo?.bitmap ?? null)
  const ask = useAsk()
  const loc = usePlace(photo?.exif ?? null)
  const draft = useDraft()
  const fileInput = useRef<HTMLInputElement>(null)
  const [crop, setCrop] = useState<Crop | null>(null)
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  // 판정을 보낼 때의 영역. 그 뒤 영역이 바뀌면 "다시 물어볼 수 있습니다"를 보여 준다
  const [askedBox, setAskedBox] = useState<NormalizedBox | null>(null)
  const [editingPlace, setEditingPlace] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saved, setSaved] = useState<{ sighting: Sighting; firstMeet: boolean } | null>(null)
  // 되살리는 중인 초안. 사진이 열린 뒤에 나머지 값을 채운다 (아래 effect)
  const [restoring, setRestoring] = useState<Draft | null>(null)

  // 새가 한 마리뿐이면 고를 것이 없으니 바로 그 상자를 쓴다
  const only = detection.boxes?.length === 1 ? detection.boxes[0] : null
  const picked = crop ?? (only ? { box: only, by: detection.detectorId } : null)
  const known = useMemo(() => [...new Set(existing.map((s) => s.speciesKo).filter(Boolean))], [existing])
  const lastPlace = useMemo<PlaceValue | null>(() => {
    const last = [...existing].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).find((s) => s.lat !== null)
    return last ? { lat: last.lat, lng: last.lng, name: last.place, source: 'manual' } : null
  }, [existing])

  /**
   * 초안의 나머지 값을 채운다 — 사진이 열린 **다음 렌더**에서. usePlace의 EXIF effect가 먼저 돌고 나서 초안의 위치를 덮어야
   * (같은 커밋에서 훅 선언 순서대로 effect가 돈다) 직접 고른 위치가 사진 좌표에 밀리지 않는다.
   */
  useEffect(() => {
    if (!restoring || photo?.file !== restoring.file) return
    setCrop(restoring.crop)
    setName(restoring.name)
    setNote(restoring.note)
    setAskedBox(restoring.askedBox)
    // 사진에서 읽은 위치는 방금 다시 읽었다. 사용자가 고른 것만 되살린다
    if (restoring.place.source !== 'exif' && restoring.place.source !== 'none') loc.copyFrom(restoring.place)
    if (restoring.verdict) ask.restore(restoring.verdict)
    setRestoring(null)
  }, [photo, restoring]) // eslint-disable-line react-hooks/exhaustive-deps

  // 값이 바뀔 때마다 초안을 (0.5초 모아서) 덮어쓴다. 사진이 없으면 남길 것이 없다. 되살리는 중에는 반쪽 값을 쓰지 않는다
  useEffect(() => {
    if (!photo || restoring || saved) return
    draft.persist({ crop, name, note, place: loc.place, verdict: ask.state === 'done' ? ask.verdict : null, askedBox })
  }, [photo, crop, name, note, loc.place, ask.state, ask.verdict, askedBox, restoring, saved]) // eslint-disable-line react-hooks/exhaustive-deps

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
      const sighting = buildSighting({ name, note, exif: photo.exif, place: loc.place, crop: cut && picked ? { box: cut.box, by: picked.by } : null, verdict: ask.verdict, cardStyle, existing, now: new Date() })
      await savePhotos(sighting.id, photo, cut?.blob ?? null)
      await journal.add(sighting)
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

  /**
   * 사진을 고르거나 바꾼다. **열기에 성공한 뒤에만** 이전 사진에 딸린 영역·판정을 비운다 — 실패하면 옛 사진이 그대로 남으므로 그것들도 남아야 한다.
   * 이름·메모는 사용자가 적은 것이라 남기고, 지도에서 직접 고른 위치도 남는다 (usePlace).
   */
  async function choose(f: File) {
    if (await picker.pick(f)) { setCrop(null); setAskedBox(null); ask.cancel(); draft.persistPhoto(f) }
  }
  /** 초안을 되살린다. 사진부터 열고, 나머지는 위 effect가 채운다. 사진을 못 열면(파일이 깨졌으면) 초안을 버린다 */
  async function resume() {
    const d = draft.take()
    if (!d) return
    setRestoring(d)
    if (!(await picker.pick(d.file))) { setRestoring(null); void draft.clear() }
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
        {draft.pending && <DraftNotice draft={draft.pending} onResume={() => void resume()} onDiscard={() => void draft.clear()} />}
        <button type="button" className="photo-drop" onClick={() => fileInput.current?.click()}>
          <Icon name="camera" size={40} /><strong>사진 고르기</strong><span>시각·위치·촬영 정보는 사진에서 자동으로 읽습니다</span>
        </button>
        {pickError}
      </div>
    )
  }

  return (
    <div className="screen screen-record">
      {/* 사진 바꾸기: 잘못 고른 사진을 바꾸는 유일한 길 — 없으면 기록을 통째로 버리고 다시 시작해야 한다 */}
      <ScreenHead title="새 기록" onBack={onCancel} right={<Button variant="quiet" icon="camera" onClick={() => fileInput.current?.click()}>사진 바꾸기</Button>} />
      {input}
      <div className="record-cols">
        <DetectView photoUrl={photo.url} ratio={`${photo.size.width} / ${photo.size.height}`} detection={detection} picked={picked?.box ?? null} onPick={(box, by) => setCrop({ box, by: by === 'manual' ? 'manual' : detection.detectorId })} />
        <div className="record-side">
          <FactsCard photo={photo} place={loc.place} onEditPlace={() => setEditingPlace(true)} />
          <Card>
            <SpeciesInput value={name} known={known} onChange={setName} />
            <IdentifyPanel ask={ask} hasCrop={picked !== null} cropChanged={ask.state === 'done' && !sameBox(askedBox, picked?.box ?? null)} name={name}
              onAsk={() => void askAI()} onApply={(v) => setName(v.speciesKo || v.latin)} onPickName={setName} onOpenSettings={onOpenSettings} />
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
