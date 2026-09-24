/**
 * 이동 기록 60일 알림 — "새로 넣을 때가 됐다"를 언제 띄우고 언제 치울지 (순수 판정 + 닫은 기억).
 * 구글은 타임라인을 폰에 두고 3개월이 지난 기록을 지운다(기본 설정). 90일을 기다리면 이미 지워진 뒤라 60일에 알린다 — 한 달의 여유.
 * 닫은 것은 "어느 넣기에 대해 닫았는지"(importedAt)로 기억한다 — 다시 넣으면 importedAt이 바뀌므로 그 60일 뒤에 또 뜬다.
 * 화면은 features/records/RecordsScreen.tsx, 요약(importedAt)은 data/tracks.ts의 TracksMeta.
 */

/** 마지막으로 넣은 지 이 날수를 넘으면 알린다. 구글의 자동 삭제(3개월)보다 한 달 앞 */
export const TRACK_REFRESH_DAYS = 60
const DAY_MS = 86_400_000

/**
 * 알림을 띄울지. now − importedAt이 60일을 **넘어야** true (정확히 60일은 아직 아니다).
 * importedAt을 못 읽으면 false — 편의 기능이라 조용한 쪽이 안전하다. dismissedFor === importedAt이면 false (그 넣기에 대해 이미 닫았다).
 * 미래 시각(기기 시계가 뒤로 감)은 false.
 */
export function needsTrackRefresh(importedAt: string, dismissedFor: string | null, now: Date): boolean {
  const t = Date.parse(importedAt)
  if (Number.isNaN(t)) return false
  if (dismissedFor === importedAt) return false
  return now.getTime() - t > TRACK_REFRESH_DAYS * DAY_MS
}

const KEY = 'bird-journal:track-nudge-dismissed'

/** 닫아 둔 넣기의 시각(importedAt). 닫은 적이 없거나 localStorage가 막혀 있으면 null */
export function loadTrackNudgeDismissed(): string | null {
  try { return localStorage.getItem(KEY) } catch { return null }
}

/** 이 넣기(importedAt)에 대해 알림을 닫았다고 기억한다. localStorage가 막혀 있으면 다음에 또 뜬다 (app/device.ts와 같은 태도) */
export function dismissTrackNudge(importedAt: string): void {
  try { localStorage.setItem(KEY, importedAt) } catch { /* 위 설명 */ }
}
