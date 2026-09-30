import { useEffect, useMemo } from 'react'
import type { Sighting } from '../../types'
import { lastPlaceOf } from './lastPlace'
import type { PickedPhoto } from './usePhotoPick'
import { usePlace } from './usePlace'
import { useTrackMatch } from './useTrackMatch'

/**
 * 기록 화면의 위치 배선 — 사진 규칙이 붙은 위치(usePlace)에 이동 기록 찾기(useTrackMatch)를 잇고,
 * 위치 줄의 근거·안내와 위치 시트의 '직전 기록 위치'를 만든다.
 * usePlace.ts에 넣지 않는 이유: 기록 상세의 수정 칸(RecordEdit — 첫 화면 묶음)이 usePlace.ts를 부른다. 거기 넣으면
 * 이동 기록 매칭 코드가 첫 화면에 딸려 온다 (bfbdb2d에서 막은 문제).
 * 초안 되살리기(useRecordFields)보다 **먼저** 부른다 — 같은 커밋의 effect는 훅을 부른 순서대로 돌아서,
 * 뒤에 부르면 usePlace의 EXIF effect가 되살린 위치를 덮는다.
 */
export function useRecordPlace(photo: PickedPhoto | null, existing: Sighting[]) {
  const loc = usePlace(photo?.exif ?? null)
  const track = useTrackMatch(photo)
  // 직전 기록 위치: 사진 없이 기록(QuickRecord)과 같은 규칙 한 곳 (lastPlace.ts)
  const lastPlace = useMemo(() => lastPlaceOf(existing), [existing])

  // 이동 기록에서 찾았으면 바로 넣는다 — 자동으로 할 수 있는 일에 버튼을 두지 않는다 (BUTTONS.md). 이미 위치가 있으면 fillIfEmpty가 거른다
  useEffect(() => { if (track.status === 'found') void loc.fillIfEmpty(track.lat, track.lng, 'tracklog') }, [track]) // eslint-disable-line react-hooks/exhaustive-deps

  // 위치 줄에 붙는 근거와 안내. "못 찾은 이유"는 위치가 비어 있을 때만 말한다 — 사용자가 고른 위치에 이동 기록 얘기를 붙이지 않는다
  const placeNote = loc.place.source === 'tracklog' && track.status === 'found' ? track.note : undefined
  const placeHint = loc.place.source === 'none' && track.status === 'missed' ? track.hint ?? undefined : undefined

  return { loc, lastPlace, placeNote, placeHint }
}
