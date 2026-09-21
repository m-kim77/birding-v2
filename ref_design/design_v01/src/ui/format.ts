/**
 * 날짜·시각 표시. 초안 전용의 단순한 구현이다 —
 * 제품에서는 v1 `src/lib/format.ts`(촬영지 시간대 복원 포함)를 가져온다.
 */

const pad2 = (n: number) => String(n).padStart(2, '0')

/** '2026-09-15T06:48:00' → '9월 15일' */
export function formatDay(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}월 ${d.getDate()}일`
}

/** '2026-09-15T06:48:00' → '2026. 09. 15. 06:48' */
export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}. ${pad2(d.getMonth() + 1)}. ${pad2(d.getDate())}. ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** 목록을 묶는 달 제목. '2026년 9월' */
export function formatMonth(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월`
}

/** 초 → '0:07' */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${pad2(s % 60)}`
}
