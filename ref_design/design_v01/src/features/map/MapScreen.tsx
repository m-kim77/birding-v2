import { useState } from 'react'
import { useStore } from '../../app/store'
import { ScreenHead } from '../../ui/bits'
import Icon from '../../ui/Icon'
import { formatDay } from '../../ui/format'
import type { Sighting } from '../../types'
import './map.css'

/** 가짜 지도가 보여 주는 범위 (서울 동쪽 일대) */
const BOUNDS = { latMin: 37.46, latMax: 37.61, lngMin: 126.99, lngMax: 127.2 }

interface Place { name: string; x: number; y: number; items: Sighting[] }

/**
 * 같은 장소의 기록을 핀 하나로 모은다.
 * 좌표가 없는 기록과 보호가 필요한 종은 지도에 올리지 않는다 — 지도 화면은 캡처돼 퍼지기 쉽다.
 */
function groupPlaces(sightings: Sighting[]): Place[] {
  const places = new Map<string, Place>()
  for (const s of sightings) {
    if (s.lat === null || s.lng === null || s.sensitive) continue
    const found = places.get(s.place)
    if (found) { found.items.push(s); continue }
    places.set(s.place, {
      name: s.place, items: [s],
      x: ((s.lng - BOUNDS.lngMin) / (BOUNDS.lngMax - BOUNDS.lngMin)) * 100,
      y: (1 - (s.lat - BOUNDS.latMin) / (BOUNDS.latMax - BOUNDS.latMin)) * 100,
    })
  }
  return [...places.values()]
}

/**
 * 지도. 핀을 누르면 그 장소의 기록이 아래에 나온다.
 * 초안에서는 그림 지도를 쓴다 — 제품에서는 v1처럼 Leaflet을 쓴다. 지도 타일은 테마를 따르지 않는다.
 */
export default function MapScreen({ onOpen }: { onOpen: (id: string) => void }) {
  const { sightings } = useStore()
  const places = groupPlaces(sightings)
  const [picked, setPicked] = useState<Place | null>(places[0] ?? null)

  return (
    <div className="screen screen-map">
      <ScreenHead title="지도" sub={`${places.length}곳에서 관찰했습니다`} />
      {places.length === 0 && <p className="hint">위치가 있는 기록이 아직 없습니다.</p>}
      <div className="map-cols">
        <div className="map-mock" role="group" aria-label="관찰 위치 지도">
          {places.map((p) => (
            <button key={p.name} type="button" className={`map-pin${picked?.name === p.name ? ' is-picked' : ''}`}
              style={{ left: `${p.x}%`, top: `${p.y}%` }} onClick={() => setPicked(p)} aria-label={`${p.name}, 기록 ${p.items.length}건`}>
              <Icon name="pin" size={30} />{p.items.length > 1 && <b>{p.items.length}</b>}
            </button>
          ))}
        </div>
        {picked && (
          <section className="card map-place">
            <h2 className="display">{picked.name}</h2>
            <ul>
              {picked.items.map((s) => (
                <li key={s.id}><button type="button" onClick={() => onOpen(s.id)}>
                  <strong>{s.speciesKo || '이름 미정'}</strong><span>{formatDay(s.capturedAt)}</span><Icon name="chevron" size={16} />
                </button></li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}
