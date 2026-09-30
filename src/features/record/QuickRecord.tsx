import { Suspense, lazy, useMemo, useState } from 'react'
import { useJournal } from '../../data/journal'
import { fromTimeInput, toTimeInput } from '../../lib/captureTime'
import { parseCount } from '../../lib/count'
import { Banner, Card, ScreenHead } from '../../ui/bits'
import Button from '../../ui/Button'
import { styleFromAccent } from '../dex/cardStyle'
import { buildSighting } from './buildSighting'
import { CountField, PlaceRow } from './RecordFacts'
import SpeciesInput from './SpeciesInput'
import { usePlaceValue, type PlaceValue } from './usePlace'
import './record.css'

// 위치 시트는 지도(Leaflet)를 끌고 온다 — 위치 줄을 누를 때 받는다 (RecordEdit과 같은 이유: 위치를 안 고르는 사람까지 지도를 받지 않게)
const LocationSheet = lazy(() => import('./LocationSheet'))

interface Props {
  /** 뒤로 — 기록하기를 시작한 화면으로 (이 화면은 새 기록 첫 화면의 칸을 바꿔 끼운 것이다, App.tsx) */
  onCancel: () => void
  /** 저장을 마쳤을 때 — 그 기록의 상세로 */
  onDone: (id: string) => void
}

/**
 * 사진 없이 기록 — 망원경으로만 본 새, 찍기 전에 날아간 새. 새 기록 첫 화면의 '사진 없이 기록'이 연다.
 * 적는 것은 이름·개체 수·본 시각·위치·메모이고 모두 비워도 저장된다 — 본 시각만은 읽을 수 있어야 한다 (지금으로 시작한다).
 * 위치는 자동으로 넣지 않는다 — 집에서 적으면 집 좌표가 관찰지로 들어간다 (usePlace). 위치 줄을 눌러 현재 위치·직전 기록 위치·지도에서 고른다.
 * 쓰던 기록(초안)으로 남기지 않고, 초안 저장소를 읽지도 지우지도 않는다 — 쓰던 사진 기록의 "이어 쓰기"가 그대로 남아야 한다 (useDraft를 쓰지 않는다).
 * 저장하면 카드 등장 없이 곧바로 그 기록의 상세로 간다. 실패하면 이유를 적고 머문다.
 */
export default function QuickRecord({ onCancel, onDone }: Props) {
  const journal = useJournal()
  const existing = journal.sightings ?? []
  const [name, setName] = useState('')
  const [count, setCount] = useState('')
  // 본 시각은 이 화면을 연 때로 시작한다 — 집에 와서 '아까 본 새'를 적을 때 고친다. 브라우저 시간대의 벽시계다 (lib/captureTime.ts)
  const [time, setTime] = useState(() => toTimeInput(new Date().toISOString(), null))
  const [note, setNote] = useState('')
  const loc = usePlaceValue()
  const [pickingPlace, setPickingPlace] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const known = useMemo(() => [...new Set(existing.map((s) => s.speciesKo).filter(Boolean))], [existing])
  // 직전 기록 위치: 마지막으로 **만든** 기록 중 위치가 있는 것 — 사진 기록 화면과 같은 규칙 (useRecordPlace). 한자리에서 여러 마리를 연달아 적을 때 쓴다
  const lastPlace = useMemo<PlaceValue | null>(() => {
    const last = [...existing].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).find((s) => s.lat !== null)
    return last ? { lat: last.lat, lng: last.lng, name: last.place, source: 'manual' } : null
  }, [existing])
  // 입력칸 값을 기록의 시각으로. 빈칸·없는 날짜면 null — 저장을 막는다. 오프셋은 그날의 브라우저 오프셋이 붙는다
  const at = fromTimeInput(time, null)

  /** 사진 없는 기록 한 건을 쓰고 그 기록의 상세로. 사진이 0장이라도 기록은 같은 트랜잭션 길로 쓴다 (journal.add — 드라이브에 올릴 일도 거기서 적힌다) */
  async function save() {
    if (!at) return
    setSaving(true)
    setError('')
    try {
      const sighting = buildSighting({
        name, note, exif: { capturedAt: at.capturedAt, capturedAtOffset: at.capturedAtOffset }, place: loc.place,
        // 사진이 없으니 자를 곳도 색을 뽑을 곳도 없다 — 카드는 기본색으로 시작하고 상세의 카드 보기에서 바꾼다
        crop: null, verdict: null, cardStyle: styleFromAccent(null), now: new Date(), count: parseCount(count), noPhoto: true,
      })
      await journal.add(sighting, [])
      onDone(sighting.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="screen screen-quick">
      <ScreenHead title="사진 없이 기록" onBack={onCancel} />
      <Card>
        <SpeciesInput value={name} known={known} onChange={setName} />
        <CountField value={count} onChange={setCount} />
      </Card>
      <WhenWhere time={time} onTime={setTime} timeOk={at !== null} place={loc.place} onEditPlace={() => setPickingPlace(true)} />
      <Card>
        <label className="field"><span>메모</span>
          <textarea rows={3} placeholder="행동, 날씨 — 기억하고 싶은 것" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </Card>
      {error && <Banner tone="err" icon="alert">{error}</Banner>}
      <div className="bottom-bar">
        <Button variant="primary" icon="check" block onClick={() => void save()} disabled={saving || !at}>{saving ? '저장하는 중…' : name.trim() ? '저장' : '이름 없이 저장'}</Button>
      </div>
      {pickingPlace && (
        // 받는 동안은 아무것도 그리지 않는다 — 대신 시트를 잠깐 그리면 뒤로가기 칸이 하나 헛칸으로 남는다 (RecordEdit과 같다)
        <Suspense fallback={null}>
          <LocationSheet place={loc.place} error={loc.error} last={lastPlace} onClose={() => setPickingPlace(false)}
            onPickOnMap={(lat, lng) => void loc.pickOnMap(lat, lng)} onUseCurrent={() => void loc.useCurrent()} onCopyLast={loc.copyFrom} />
        </Suspense>
      )}
    </div>
  )
}

/**
 * 언제·어디서 카드 — 본 시각 칸과 위치 한 줄. 그리기만 한다. 시각을 읽을 수 없으면(`timeOk`가 아니면) 칸 밑에 알린다 — 저장은 부르는 쪽이 막는다.
 * 위치 줄은 사진 기록 화면·수정 칸과 같은 한 줄이다 (PlaceRow) — 줄 전체가 위치 시트를 여는 버튼이다.
 */
function WhenWhere({ time, onTime, timeOk, place, onEditPlace }: { time: string; onTime: (v: string) => void; timeOk: boolean; place: PlaceValue; onEditPlace: () => void }) {
  return (
    <Card>
      <label className="field"><span>본 시각</span><input type="datetime-local" value={time} onChange={(e) => onTime(e.target.value)} /></label>
      {!timeOk && <p className="status-line is-warn" role="alert">본 시각을 끝까지 채워 주세요.</p>}
      <div className="field"><span>위치</span><PlaceRow place={place} onClick={onEditPlace} /></div>
    </Card>
  )
}
