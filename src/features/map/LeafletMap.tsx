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

/** 핀이 다 보이게 시야를 맞춘다. 핀이 없으면 그대로 둔다 */
function fitTo(m: L.Map, markers: MapMarker[]): void {
  if (markers.length > 1) m.fitBounds(L.latLngBounds(markers.map((mk) => [mk.lat, mk.lng])), { padding: [36, 36], maxZoom: 15 })
  else if (markers.length === 1) m.setView([markers[0].lat, markers[0].lng], Math.max(m.getZoom(), 14))
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
  const latest = useRef(markers)
  latest.current = markers
  // 지난번에 시야를 맞춘 핀들의 서명(키+좌표). 핀을 눌러 picked만 바뀐 것은 같은 서명이다 — 그때 시야를 다시 맞추면 사용자가 확대해 둔 것이 튄다
  const fittedKeys = useRef<string | null>(null)

  useEffect(() => {
    if (!el.current) return
    const m = L.map(el.current, { zoomControl: true, attributionControl: true }).setView(center, 12)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m)
    m.on('click', (e) => handlers.current.onPick?.(e.latlng.lat, e.latlng.lng))
    layer.current = L.layerGroup().addTo(m)
    map.current = m
    // 처음에는 컨테이너 크기를 잘못 재는 경우가 있다(늦게 받는 화면·시트 안) — 한 박자 뒤에 다시 재고, 그 크기로 시야를 다시 맞춘다.
    // 아래 효과가 크기 0일 때 맞춘 시야는 틀리기 때문이다
    const timer = window.setTimeout(() => { m.invalidateSize(); fitTo(m, latest.current) }, 60)
    return () => { window.clearTimeout(timer); m.remove(); map.current = null }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!map.current || !layer.current) return
    layer.current.clearLayers()
    for (const mk of markers) {
      L.marker([mk.lat, mk.lng], { icon: pinIcon(mk), keyboard: true }).on('click', () => handlers.current.onMarker?.(mk.key)).addTo(layer.current)
    }
    // 시야는 핀이 늘거나 줄거나 **옮겨졌을 때만** 맞춘다. 좌표를 서명에 넣는 이유: 위치 시트의 핀은 키('here')가 같은 채 좌표만 바뀐다
    const keys = markers.map((mk) => `${mk.key}@${mk.lat},${mk.lng}`).sort().join('|')
    if (keys === fittedKeys.current) return
    fittedKeys.current = keys
    fitTo(map.current, markers)
  }, [markers])

  return <div ref={el} className="leaf-map" />
}
