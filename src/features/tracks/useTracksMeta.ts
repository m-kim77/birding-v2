import { useCallback, useEffect, useRef, useState } from 'react'
import { readTracksMeta, type TracksMeta } from '../../data/tracks'

/**
 * 이동 기록 요약(범위·점 수·넣은 시각)을 읽어 두는 훅. 설정 카드(TracksSection)와 목록 화면의 60일 알림이 쓴다.
 * - `undefined`: 아직 읽는 중 — 화면은 아무것도 그리지 않는다 ("없음"으로 잘못 보이지 않게)
 * - `null`: 넣은 파일 없음. DB를 못 열어도 null (readTracksMeta가 삼킨다 — 편의 기능이다)
 * `refresh`는 넣기·지우기 뒤에 부른다. 언마운트 뒤에 도착한 결과는 버린다.
 */
export function useTracksMeta(): { meta: TracksMeta | null | undefined; refresh: () => Promise<void> } {
  const [meta, setMeta] = useState<TracksMeta | null | undefined>(undefined)
  const alive = useRef(true)

  const refresh = useCallback(async () => {
    const next = await readTracksMeta()
    if (alive.current) setMeta(next)
  }, [])

  useEffect(() => {
    // StrictMode는 mount → 정리 → mount를 한 번 더 돈다 — 정리에서 내린 플래그를 다시 올린다
    alive.current = true
    void refresh()
    return () => { alive.current = false }
  }, [refresh])

  return { meta, refresh }
}
