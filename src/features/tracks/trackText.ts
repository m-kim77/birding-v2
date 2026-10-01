/**
 * 이동 기록 요약(TracksMeta)과 넣기 진행(ImportProgress)을 화면 문구로 바꾸는 순수 함수. 설정 카드(settings/TracksSection)가 쓴다.
 * 좌표는 여기서 다루지 않는다 — 화면 어디에도 좌표를 보여 주지 않는다. 범위·점 수·넣은 날·진행 단계만 글자로 만든다.
 */
// 확장자를 적는 이유: node --test가 이 파일을 직접 읽는다 (Vite는 어느 쪽이든 된다)
import { dayOf, daysAgoOf } from '../../ui/when.ts'
import type { TracksMeta } from '../../data/tracks'
import type { ImportProgress } from './importTracks'

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

/**
 * 진행 단계를 막대 값과 문구로. 읽기·파싱은 워커가 진행률을 줄 수 없어 고정값(0.1·0.5)으로 "멈추지 않았다"만 보인다 — 부정확한 진행이다.
 * 저장은 날짜 수로 정확히 잰다 (done/total). total이 0이면 0.
 */
export function progressOf(p: ImportProgress): { value: number; text: string } {
  if (p.stage === 'reading') return { value: 0.1, text: '파일을 읽는 중…' }
  if (p.stage === 'parsing') return { value: 0.5, text: '점을 고르는 중…' }
  const done = p.done ?? 0
  const total = p.total ?? 0
  return { value: total ? done / total : 0, text: `저장하는 중 · ${done}/${total}일` }
}

/**
 * 상태 줄: '5월 22일 ~ 8월 20일 · 22,426점 · 넣은 날 3일 전'. 넣은 시각을 못 읽으면 그 부분만 뺀다.
 * `now`는 범위의 연도 표기와 '넣은 날'의 기준이다 (안 주면 지금).
 */
export function summaryOf(meta: TracksMeta, now = new Date()): string {
  const ago = daysAgoOf(meta.importedAt, now)
  return [trackRangeText(meta, now), pointCountText(meta.count), ago && `넣은 날 ${ago}`].filter(Boolean).join(' · ')
}
