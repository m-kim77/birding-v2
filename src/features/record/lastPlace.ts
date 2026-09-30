/**
 * 위치 시트의 '직전 기록 위치'를 고르는 규칙 한 곳. 사진 기록 화면(useRecordPlace)과 사진 없이 기록(QuickRecord)이 같이 쓴다 —
 * 두 화면에 따로 적으면 한쪽만 고쳐져 같은 버튼이 다른 위치를 넣는다. 순수 함수다 (node --test가 직접 읽는다).
 */
// 확장자를 적는 이유: node --test가 이 파일을 직접 읽는다 (Vite는 어느 쪽이든 된다)
import { newestFirst } from '../../lib/timeOrder.ts'
import type { Sighting } from '../../types'
import type { PlaceValue } from './usePlace'

/**
 * 마지막으로 **만든** 기록 가운데 좌표가 있는 것의 위치 — 한자리에서 여러 마리를 연달아 적을 때 쓴다.
 * 촬영 시각이 아니라 만든 시각(`createdAt`)으로 고른다 — 방금 적은 기록의 자리가 다음 기록의 자리일 가능성이 가장 높다.
 * 만든 시각은 글자가 아니라 순간으로 견준다 (lib/timeOrder.ts) — '+09:00'이 붙은 백업을 불러와도 '마지막'이 맞다. 못 읽는 시각은 가장 옛것, 같은 순간이면 받은 순서.
 * 출처는 'manual'(사람이 골랐다)로 넘긴다. 좌표가 있는 기록이 없으면(기록이 없을 때도) null — 시트가 버튼을 그리지 않는다.
 * 받은 배열은 건드리지 않는다.
 */
export function lastPlaceOf(existing: Sighting[]): PlaceValue | null {
  const last = [...existing].sort((a, b) => newestFirst(a.createdAt, b.createdAt)).find((s) => s.lat !== null)
  return last ? { lat: last.lat, lng: last.lng, name: last.place, source: 'manual' } : null
}
