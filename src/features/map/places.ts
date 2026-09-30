/**
 * 지도(map/MapScreen)가 핀을 만들 때 쓰는 순수 계산. node --test로 검사한다.
 * 지도 라이브러리(Leaflet)를 부르지 않는다 — 그래야 테스트가 지도 없이 돌고, 지도 묶음이 첫 화면에 딸려 오지 않는다.
 * 위치를 숨긴 기록을 핀에서 빼는 사생활 규칙이 여기 있다.
 */
// 확장자를 적는 이유: node --test가 이 파일을 직접 읽는다 (Vite는 어느 쪽이든 된다)
import { instantOf } from '../../lib/timeOrder.ts'
import { NO_PLACE_NAME } from '../../ui/sightingText.ts'
import type { Sighting } from '../../types'

/** 지도의 핀 하나: 가까운 기록 여럿을 묶은 것 */
export interface Place { key: string; name: string; lat: number; lng: number; items: Sighting[] }

/**
 * 가까운 기록을 핀 하나로 모은다 (좌표를 소수 3자리 ≈ 110m 격자로 뭉갠다 — 같은 탐조지의 기록이 한 핀이 된다).
 * 좌표가 없는 기록과 위치를 숨긴 기록(`sensitive` — records/HideLocationSwitch)은 지도에 올리지 않는다 — 지도 화면은 캡처돼 퍼지기 쉽다.
 * 핀의 좌표·이름은 그 자리에서 **가장 먼저 찍은** 기록의 것이다 — 목록 순서가 아니라 촬영 시각으로 고르므로 기록이 늘어도 핀이 움직이지 않는다
 * (핀이 움직이면 지도가 시야를 다시 맞춰 사용자가 확대해 둔 것이 튄다 — LeafletMap).
 * 촬영 시각은 글자가 아니라 순간으로 견준다 (lib/timeOrder.ts) — 같은 순간이면 id가 앞선 기록, 못 읽는 시각은 가장 옛것으로 친다.
 * 기록이 없으면 빈 목록. 장소 이름이 빈 기록이 대표가 되면 핀 이름은 '장소 이름 없음' (NO_PLACE_NAME — 일지의 장소 고르개와 같은 말).
 */
export function groupPlaces(sightings: Sighting[]): Place[] {
  const groups = new Map<string, Sighting[]>()
  for (const s of sightings) {
    if (s.lat === null || s.lng === null || s.sensitive) continue
    const key = `${s.lat.toFixed(3)},${s.lng.toFixed(3)}`
    groups.set(key, [...(groups.get(key) ?? []), s])
  }
  const earlier = (a: Sighting, b: Sighting) => {
    const x = instantOf(a.capturedAt)
    const y = instantOf(b.capturedAt)
    return x === y ? a.id < b.id : x < y
  }
  return [...groups.entries()].map(([key, items]) => {
    const first = items.reduce((a, b) => (earlier(b, a) ? b : a))
    return { key, name: first.place || NO_PLACE_NAME, lat: first.lat!, lng: first.lng!, items }
  })
}

/**
 * 위치를 숨겨서 핀에서 뺀 기록 수. 좌표가 없는 기록은 세지 않는다 — 없어서 못 올린 것이지 숨긴 것이 아니다.
 * 세어 알리는 까닭: 말없이 사라지면 사용자가 기록을 잃은 줄 안다.
 */
export function hiddenCount(sightings: Sighting[]): number {
  return sightings.filter((s) => s.sensitive && s.lat !== null && s.lng !== null).length
}
