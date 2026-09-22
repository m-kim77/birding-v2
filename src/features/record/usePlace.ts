import { useEffect, useState } from 'react'
import { currentPosition, lookupPlace } from '../../lib/place'
import type { LocationSource } from '../../types'

export interface PlaceValue {
  lat: number | null
  lng: number | null
  name: string
  source: LocationSource
}

const NONE: PlaceValue = { lat: null, lng: null, name: '', source: 'none' }

/** 위치가 어디서 왔는지 사용자에게 보여 주는 말 */
export const SOURCE_LABEL: Record<LocationSource, string> = {
  exif: '사진 정보에서', tracklog: '이동 기록으로 추정', gps: '기록할 때의 현재 위치', manual: '지도에서 직접 고름', none: '위치 없음 — 눌러서 고르기',
}

/**
 * 기록의 위치. 사진에 좌표가 있으면 그것으로 시작하고, 없으면 "위치 없음"으로 둔다.
 * 현재 위치를 자동으로 넣지 않는 이유: 집에서 정리할 때 집 좌표가 촬영지로 들어가 버린다. 현재 위치는 사용자가 고를 때만 쓴다.
 * 좌표가 정해질 때마다 장소 이름을 찾아 채운다 (못 찾으면 빈 이름 — 좌표는 남는다).
 * 사진을 바꿔도 사용자가 직접 고른 위치는 남는다 — 지워지는 것은 앞 사진에서 읽은 좌표뿐이다.
 */
export function usePlace(exif: { lat?: number; lng?: number } | null) {
  const [place, setPlace] = useState<PlaceValue>(NONE)
  const [error, setError] = useState('')

  /** 좌표를 정하고 이름을 찾는다 */
  async function setCoords(lat: number, lng: number, source: LocationSource) {
    setError('')
    setPlace({ lat, lng, name: '', source })
    const name = await lookupPlace(lat, lng)
    // 이름을 찾는 사이에 다른 좌표로 바뀌었으면 늦게 온 이름을 버린다
    setPlace((cur) => (cur.lat === lat && cur.lng === lng ? { ...cur, name } : cur))
  }

  useEffect(() => {
    if (exif?.lat !== undefined && exif.lng !== undefined) void setCoords(exif.lat, exif.lng, 'exif')
    // 새 사진에 좌표가 없다는 이유로 지도에서 고르거나 현재 위치로 넣은 값을 지우지 않는다 — 같은 자리에서 찍은 더 나은 사진으로 바꾸는 일이 흔하다
    else setPlace((cur) => (cur.source === 'exif' ? NONE : cur))
  }, [exif]) // eslint-disable-line react-hooks/exhaustive-deps

  /** "현재 위치로" */
  async function useCurrent() {
    try { const p = await currentPosition(); await setCoords(p.lat, p.lng, 'gps') } catch (e) { setError(e instanceof Error ? e.message : '현재 위치를 찾지 못했습니다.') }
  }

  return { place, error, pickOnMap: (lat: number, lng: number) => setCoords(lat, lng, 'manual'), useCurrent, copyFrom: (p: PlaceValue) => setPlace(p) }
}
