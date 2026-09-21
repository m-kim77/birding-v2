import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'

export interface MapMarker {
  key: string
  lat: number
  lng: number
  /** 핀 옆 숫자 (그 장소의 기록 수). 1이면 숫자를 그리지 않는다 */
  count?: number
  picked?: boolean
}

interface Props {
  markers: MapMarker[]
  /** 처음 보여 줄 중심. 핀이 있으면 핀들이 다 보이게 맞추고, 없으면 이 값을 쓴다 */
  center: [number, number]
  onMarker?: (key: string) => void
  /** 주면 지도를 눌러 위치를 고를 수 있다 */
  onPick?: (lat: number, lng: number) => void
}

/** 핀 아이콘. 기본 이미지 핀은 번들러에서 경로가 깨지기 쉬워 HTML 핀을 쓴다 */
function pinIcon(m: MapMarker): L.DivIcon {
  const badge = m.count && m.count > 1 ? `<b>${m.count}</b>` : ''
  return L.divIcon({ className: `leaf-pin${m.picked ? ' is-picked' : ''}`, html: `<i></i>${badge}`, iconSize: [30, 40], iconAnchor: [15, 38] })
}

/**
 * Leaflet 지도 (OpenStreetMap 타일, 키가 필요 없다). 지도 타일은 앱 테마를 따르지 않는다.
 * React가 다시 그려도 지도를 새로 만들지 않고, 핀만 갈아 끼운다.
 */
export default function LeafletMap({ markers, center, onMarker, onPick }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)
  const handlers = useRef({ onMarker, onPick })
  handlers.current = { onMarker, onPick }

  useEffect(() => {
    if (!el.current) return
    const m = L.map(el.current, { zoomControl: true, attributionControl: true }).setView(center, 12)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m)
    m.on('click', (e) => handlers.current.onPick?.(e.latlng.lat, e.latlng.lng))
    layer.current = L.layerGroup().addTo(m)
    map.current = m
    // 시트 안에서 열리면 처음 크기를 잘못 재는 경우가 있다 — 한 박자 뒤에 다시 재게 한다
    const timer = window.setTimeout(() => m.invalidateSize(), 60)
    return () => { window.clearTimeout(timer); m.remove(); map.current = null }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!map.current || !layer.current) return
    layer.current.clearLayers()
    for (const mk of markers) {
      L.marker([mk.lat, mk.lng], { icon: pinIcon(mk), keyboard: true }).on('click', () => handlers.current.onMarker?.(mk.key)).addTo(layer.current)
    }
    if (markers.length > 1) map.current.fitBounds(L.latLngBounds(markers.map((mk) => [mk.lat, mk.lng])), { padding: [36, 36], maxZoom: 15 })
    else if (markers.length === 1) map.current.setView([markers[0].lat, markers[0].lng], Math.max(map.current.getZoom(), 14))
  }, [markers])

  return <div ref={el} className="leaf-map" />
}
