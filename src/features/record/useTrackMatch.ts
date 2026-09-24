import { useEffect, useState } from 'react'
import { readPointsAround, readTracksMeta, type TracksMeta } from '../../data/tracks'
import { explainMiss, matchTrackPoint } from '../../lib/tracklog/match'
import { dayOf } from '../../ui/when'

/**
 * 이동 기록에서 위치를 찾은 결과.
 * idle = 찾을 이유가 없거나 아직 찾는 중 (사진 없음 / 촬영 시각 없음 / 사진에 GPS 있음 / 이동 기록 없음 / DB 오류).
 * "찾는 중"을 따로 두지 않는 이유: 날짜 세 키만 읽어 몇 ms면 끝난다 — 안내 줄이 생겼다 사라지며 아래 줄을 밀어 화면만 흔들린다.
 * found = 보간한 좌표. note는 위치 줄 아래에 붙는 근거 ("앞뒤 점 간격 N분").
 * missed = 이동 기록은 있는데 그 시각의 앞뒤 점이 없다. hint는 사용자가 할 수 있는 일 — 없으면 null (범위 안의 빈 날은 권유할 것이 없다).
 */
export type TrackSearch =
  | { status: 'idle' }
  | { status: 'found'; lat: number; lng: number; tier: 1 | 2; note: string }
  | { status: 'missed'; hint: string | null }

const IDLE: TrackSearch = { status: 'idle' }

/**
 * 못 찾았을 때 무엇을 말할지. 기록 끝보다 뒤면 새로 내보내라고, 시작보다 앞이면 남아 있지 않다고 말한다.
 * 범위 안인데 비었으면(비행기 모드 등) null — 다시 내보내도 없으니 아무 권유도 하지 않는다.
 * 날짜는 브라우저 시간대다 (capturedAtOffset null → dayOf가 그렇게 푼다).
 */
function missHint(tMs: number, meta: TracksMeta): string | null {
  const reason = explainMiss(tMs, { start: Date.parse(meta.rangeStart), end: Date.parse(meta.rangeEnd) })
  if (reason === 'after-end') return `이동 기록이 ${dayOf({ capturedAt: meta.rangeEnd, capturedAtOffset: null })}까지입니다. 폰에서 새로 내보내 넣어 주세요.`
  if (reason === 'before-start') return '그때 이동 기록은 남아 있지 않습니다.'
  return null
}

/**
 * 촬영 시각 하나로 이동 기록을 찾는다. 요약(meta)이 없거나 시각을 못 읽으면 idle.
 * 촬영일 ±1일의 점만 읽어 앞뒤 점을 보간한다 (match.ts) — 시간대 변환은 없다, 둘 다 epoch ms다.
 * readPointsAround의 DB 오류는 그대로 던진다 — 부르는 훅이 삼킨다.
 */
async function search(capturedAt: string): Promise<TrackSearch> {
  const meta = await readTracksMeta()
  if (!meta) return IDLE
  const t = Date.parse(capturedAt)
  if (Number.isNaN(t)) return IDLE
  const m = matchTrackPoint(await readPointsAround(t), t)
  if (!m.matched) return { status: 'missed', hint: missHint(t, meta) }
  // v1 문구. Tier 2(이동 경로)는 정확도 값이 없어 그 사실을 함께 말한다
  const note = `앞뒤 점 간격 ${m.gapMin}분` + (m.tier === 2 ? ' · 이동 경로 기반이라 정확도가 표시되지 않습니다' : '')
  return { status: 'found', lat: m.lat, lng: m.lng, tier: m.tier, note }
}

/**
 * 사진의 촬영 시각으로 이동 기록(구글 타임라인)에서 위치를 찾는다. 사진이 바뀔 때마다 다시 찾는다.
 * 찾는 조건: 사진이 있고, 촬영 시각이 있고, 사진에 GPS가 없다 (usePlace와 같은 뜻으로 lat·lng 둘 다 있어야 GPS가 있는 것이다).
 * 결과를 위치에 넣는 것은 부르는 쪽(RecordFlow → usePlace.fillIfEmpty)이다 — 이 훅은 찾기만 한다.
 * DB 오류는 삼키고 idle (편의 기능 — 기록 작성을 막지 않는다). 사진이 바뀌거나 화면을 떠난 뒤 늦게 온 결과는 버린다.
 * 좌표를 콘솔에 찍지 않는다.
 */
export function useTrackMatch(photo: { exif: { capturedAt?: string; lat?: number; lng?: number } } | null): TrackSearch {
  const [result, setResult] = useState<TrackSearch>(IDLE)

  useEffect(() => {
    const capturedAt = photo?.exif.capturedAt
    const hasGps = photo?.exif.lat !== undefined && photo?.exif.lng !== undefined
    if (!photo || !capturedAt || hasGps) { setResult(IDLE); return }
    let alive = true
    // 앞 사진의 결과가 새 사진에 붙어 보이지 않게 먼저 비운다
    setResult(IDLE)
    search(capturedAt)
      .catch(() => IDLE)
      .then((r) => { if (alive) setResult(r) })
    return () => { alive = false }
  }, [photo])

  return result
}
