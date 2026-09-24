/**
 * 이동 기록 요약(TracksMeta)을 화면 문구로 바꾸는 순수 함수. 설정 카드(settings/TracksSection)가 쓴다.
 * 좌표는 여기서 다루지 않는다 — 화면 어디에도 좌표를 보여 주지 않는다. 범위·점 수만 글자로 만든다.
 */
// 확장자를 적는 이유: node --test가 이 파일을 직접 읽는다 (Vite는 어느 쪽이든 된다)
import { dayOf } from '../../ui/when.ts'
import type { TracksMeta } from '../../data/tracks'

/**
 * 한 시각을 'M월 D일'로, 연도가 `nowYear`와 다르면 'YYYY년 M월 D일'로. 브라우저 시간대다 (ui/when.ts와 같은 기준).
 * 못 읽는 시각이면 null.
 */
function dayText(iso: string, nowYear: number): string | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const day = dayOf({ capturedAt: iso, capturedAtOffset: null })
  // getFullYear는 dayOf가 쓰는 localParts와 같은 브라우저 시간대다 — 연말 자정 근처에서 월·일과 연도가 어긋나지 않는다
  const year = d.getFullYear()
  return year === nowYear ? day : `${year}년 ${day}`
}

/**
 * '5월 22일 ~ 8월 20일'. 시작 또는 끝의 연도가 `now`의 연도와 다르면 그쪽에만 'YYYY년 '을 붙인다.
 * 요약의 시각은 isTracksMeta(data/tracks.ts)가 이미 걸렀지만, 못 읽는 값이면 '기간을 읽지 못함' (NaN을 화면에 내지 않는다).
 */
export function trackRangeText(meta: TracksMeta, now = new Date()): string {
  const year = now.getFullYear()
  const start = dayText(meta.rangeStart, year)
  const end = dayText(meta.rangeEnd, year)
  return start && end ? `${start} ~ ${end}` : '기간을 읽지 못함'
}

/** '22,426점' */
export function pointCountText(n: number): string {
  return `${n.toLocaleString('ko-KR')}점`
}
