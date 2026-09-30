import { useMemo, useState } from 'react'
import { useJournal } from '../../data/journal'
import { ScreenHead } from '../../ui/bits'
import Icon from '../../ui/Icon'
import { nameText } from '../../ui/sightingText'
import { dayOf } from '../../ui/when'
import LeafletMap, { type MapMarker } from './LeafletMap'
import { groupPlaces, hiddenCount } from './places'
import './map.css'

/** 핀이 하나도 없을 때의 중심 (서울) */
const DEFAULT_CENTER: [number, number] = [37.5665, 126.978]

/** 지도. 핀을 누르면 그 장소의 기록이 옆(폰에서는 아래)에 나온다 */
export default function MapScreen({ onOpen }: { onOpen: (id: string) => void }) {
  const { sightings } = useJournal()
  const places = useMemo(() => groupPlaces(sightings ?? []), [sightings])
  // 핀에서 뺀 기록 수 — 말없이 사라지면 기록을 잃은 줄 안다
  const hidden = useMemo(() => hiddenCount(sightings ?? []), [sightings])
  const [pickedKey, setPickedKey] = useState('')
  const picked = places.find((p) => p.key === pickedKey) ?? null
  const markers = useMemo<MapMarker[]>(() => places.map((p) => ({ key: p.key, lat: p.lat, lng: p.lng, count: p.items.length, picked: p.key === pickedKey })), [places, pickedKey])

  return (
    <div className="screen screen-map">
      <ScreenHead title="지도" sub={places.length ? `${places.length}곳에서 관찰했습니다` : undefined} />
      {places.length === 0 && hidden === 0 && <p className="hint">위치가 있는 기록이 아직 없습니다.</p>}
      {hidden > 0 && <p className="hint">위치를 숨긴 기록 {hidden}건은 지도에 올리지 않았습니다.</p>}
      <div className="map-cols">
        <div className="map-frame"><LeafletMap markers={markers} center={DEFAULT_CENTER} onMarker={setPickedKey} /></div>
        {picked && (
          <section className="card map-place">
            <h2 className="display">{picked.name}</h2>
            <ul>
              {picked.items.map((s) => (
                <li key={s.id}><button type="button" onClick={() => onOpen(s.id)}>
                  <strong>{nameText(s.speciesKo)}</strong><span>{dayOf(s)}</span><Icon name="chevron" size={16} />
                </button></li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}
