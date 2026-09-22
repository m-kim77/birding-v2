import { useMemo, useState } from 'react'
import { useJournal } from '../../data/journal'
import { ScreenHead } from '../../ui/bits'
import Icon from '../../ui/Icon'
import { dayOf } from '../../ui/when'
import type { Sighting } from '../../types'
import LeafletMap, { type MapMarker } from './LeafletMap'
import './map.css'

/** 핀이 하나도 없을 때의 중심 (서울) */
const DEFAULT_CENTER: [number, number] = [37.5665, 126.978]

interface Place { key: string; name: string; lat: number; lng: number; items: Sighting[] }

/**
 * 가까운 기록을 핀 하나로 모은다 (좌표를 소수 3자리 ≈ 110m 격자로 뭉갠다 — 같은 탐조지의 기록이 한 핀이 된다).
 * 좌표가 없는 기록과 보호가 필요한 종은 지도에 올리지 않는다 — 지도 화면은 캡처돼 퍼지기 쉽다.
 * 핀의 좌표·이름은 그 자리에서 **가장 먼저 찍은** 기록의 것이다 — 목록 순서가 아니라 촬영 시각으로 고르므로 기록이 늘어도 핀이 움직이지 않는다
 * (핀이 움직이면 지도가 시야를 다시 맞춰 사용자가 확대해 둔 것이 튄다 — LeafletMap).
 */
function groupPlaces(sightings: Sighting[]): Place[] {
  const groups = new Map<string, Sighting[]>()
  for (const s of sightings) {
    if (s.lat === null || s.lng === null || s.sensitive) continue
    const key = `${s.lat.toFixed(3)},${s.lng.toFixed(3)}`
    groups.set(key, [...(groups.get(key) ?? []), s])
  }
  const earlier = (a: Sighting, b: Sighting) => (a.capturedAt === b.capturedAt ? a.id < b.id : a.capturedAt < b.capturedAt)
  return [...groups.entries()].map(([key, items]) => {
    const first = items.reduce((a, b) => (earlier(b, a) ? b : a))
    return { key, name: first.place || '이름 없는 장소', lat: first.lat!, lng: first.lng!, items }
  })
}

/** 지도. 핀을 누르면 그 장소의 기록이 옆(폰에서는 아래)에 나온다 */
export default function MapScreen({ onOpen }: { onOpen: (id: string) => void }) {
  const { sightings } = useJournal()
  const places = useMemo(() => groupPlaces(sightings ?? []), [sightings])
  const [pickedKey, setPickedKey] = useState('')
  const picked = places.find((p) => p.key === pickedKey) ?? null
  const markers = useMemo<MapMarker[]>(() => places.map((p) => ({ key: p.key, lat: p.lat, lng: p.lng, count: p.items.length, picked: p.key === pickedKey })), [places, pickedKey])

  return (
    <div className="screen screen-map">
      <ScreenHead title="지도" sub={places.length ? `${places.length}곳에서 관찰했습니다` : undefined} />
      {places.length === 0 && <p className="hint">위치가 있는 기록이 아직 없습니다.</p>}
      <div className="map-cols">
        <div className="map-frame"><LeafletMap markers={markers} center={DEFAULT_CENTER} onMarker={setPickedKey} /></div>
        {picked && (
          <section className="card map-place">
            <h2 className="display">{picked.name}</h2>
            <ul>
              {picked.items.map((s) => (
                <li key={s.id}><button type="button" onClick={() => onOpen(s.id)}>
                  <strong>{s.speciesKo || '이름 미정'}</strong><span>{dayOf(s)}</span><Icon name="chevron" size={16} />
                </button></li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}
