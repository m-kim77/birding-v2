import { useEffect, useRef, useState } from 'react'
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
 * 사진을 바꿔도 사용자가 직접 고른 위치는 남는다 — 지워지는 것은 앞 사진에서 나온 좌표(EXIF·이동 기록)뿐이다.
 * 이동 기록 매칭은 useTrackMatch가 하고 결과를 fillIfEmpty로 넣는다 — 위치가 비어 있을 때만 든다.
 */
export function usePlace(exif: { lat?: number; lng?: number } | null) {
  const [place, setPlace] = useState<PlaceValue>(NONE)
  const [error, setError] = useState('')
  // 렌더마다 갱신 — fillIfEmpty가 늦게 불려도(매칭이 끝난 뒤) 그 순간의 위치를 보게
  const placeRef = useRef(place)
  placeRef.current = place

  /**
   * 좌표를 정하고 이름을 찾는다. `onlyIfEmpty`면 **넣는 그 순간** 위치가 비어 있을 때만 넣는다 — 먼저 줄 선 다른 변경(되살린 초안의 위치 등)이
   * 아직 그려지기 전이어도 덮지 않는다. 넣지 않았으면 뒤의 이름도 붙지 않는다 (좌표가 다르다).
   */
  async function setCoords(lat: number, lng: number, source: LocationSource, onlyIfEmpty = false) {
    setError('')
    setPlace((cur) => (onlyIfEmpty && cur.source !== 'none' ? cur : { lat, lng, name: '', source }))
    const name = await lookupPlace(lat, lng)
    // 이름을 찾는 사이에 다른 좌표로 바뀌었으면 늦게 온 이름을 버린다
    setPlace((cur) => (cur.lat === lat && cur.lng === lng ? { ...cur, name } : cur))
  }

  useEffect(() => {
    if (exif?.lat !== undefined && exif.lng !== undefined) void setCoords(exif.lat, exif.lng, 'exif')
    // 새 사진에 좌표가 없다는 이유로 지도에서 고르거나 현재 위치로 넣은 값을 지우지 않는다 — 같은 자리에서 찍은 더 나은 사진으로 바꾸는 일이 흔하다.
    // 이동 기록에서 온 위치는 앞 사진의 촬영 시각에서 나온 것이라 EXIF처럼 비운다 — 새 사진의 시각으로 다시 찾는다 (useTrackMatch)
    else setPlace((cur) => (cur.source === 'exif' || cur.source === 'tracklog' ? NONE : cur))
  }, [exif]) // eslint-disable-line react-hooks/exhaustive-deps

  /** "현재 위치로" */
  async function useCurrent() {
    try { const p = await currentPosition(); await setCoords(p.lat, p.lng, 'gps') } catch (e) { setError(e instanceof Error ? e.message : '현재 위치를 찾지 못했습니다.') }
  }

  /**
   * 위치가 비어 있을 때만 좌표를 넣는다 (이동 기록 매칭이 쓴다). 사용자가 고른 위치·사진 좌표·되살린 초안의 위치를 덮지 않는다.
   * 두 번 본다: 부르는 순간의 위치(placeRef — 매칭을 시작할 때의 place는 낡았다)로 먼저 걸러 쓸데없는 장소 이름 찾기(좌표가 서버로 간다)를 막고,
   * 넣는 순간에 setCoords가 한 번 더 본다 (아직 그려지지 않은 변경까지).
   */
  async function fillIfEmpty(lat: number, lng: number, source: LocationSource): Promise<void> {
    if (placeRef.current.source !== 'none') return
    await setCoords(lat, lng, source, true)
  }

  return { place, error, pickOnMap: (lat: number, lng: number) => setCoords(lat, lng, 'manual'), useCurrent, copyFrom: (p: PlaceValue) => setPlace(p), fillIfEmpty }
}
