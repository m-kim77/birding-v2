/**
 * 기록 시각(ISO 글자)의 앞뒤를 글자가 아니라 **순간**으로 견준다 (작업 35).
 * 글자로 견주면 '2026-09-22T01:00:00+09:00'(= 21일 16:00 UTC)이 '2026-09-21T20:00:00.000Z'보다 늦은 것처럼 보인다.
 * 앱이 만드는 시각은 모두 UTC 'Z'라 평소에는 답이 같지만, 다른 형식의 시각이 든 백업을 불러오면 순서가 몇 시간 범위로 어긋난다.
 *
 * `updatedAt` 비교(백업·드라이브 합치기 — journal.tsx·backupFormat.ts·syncPlan.ts)는 여기로 옮기지 않는다.
 * 그쪽은 "글자 비교가 곧 시각 비교"라고 정해 둔 합치기 규칙이라, 바꾸면 합친 결과가 달라질 수 있다.
 */

/**
 * ISO 시각 글자를 밀리초로. 빈 값·못 읽는 값이면 -Infinity — 가장 옛것으로 친다 (NaN으로 두면 정렬이 흐트러진다).
 * 오프셋이 없는 글자('2026-09-22T01:00:00')는 `Date.parse`가 실행 기기의 시간대로 읽는다 — 앱이 쓰는 시각에는 늘 오프셋이 있다.
 */
export function instantOf(iso: string | null | undefined): number {
  const at = iso ? Date.parse(iso) : Number.NaN
  return Number.isNaN(at) ? -Infinity : at
}

/**
 * 최신순 정렬의 비교 함수 — `a`가 더 늦은 순간이면 음수. 못 읽는 시각은 맨 뒤로 간다.
 * 같은 순간이면(둘 다 못 읽는 값도) 0이라 원래 순서가 그대로 남는다 (`Array.prototype.sort`는 안정 정렬이다).
 * 빼지 않고 크기로 견준다 — -Infinity끼리 빼면 NaN이 되어 정렬이 흐트러진다.
 */
export function newestFirst(a: string, b: string): number {
  const x = instantOf(a)
  const y = instantOf(b)
  return x > y ? -1 : x < y ? 1 : 0
}

/**
 * 기록의 최신순 비교 — 순간으로 견주고(newestFirst), 같은 순간이면 id 글자의 **거꾸로**. 못 읽는 시각은 맨 뒤(서로는 id의 거꾸로).
 * 탐조 묶음(records/outings.ts — 옛것부터, 같은 순간이면 id 순)의 정확한 역순이라 일지 목록에서 한 묶음의 기록이 이어 나온다.
 * 같은 순간을 입력 순서에 맡기면 묶음 경계에서 두 줄이 엇갈려 같은 머리줄이 두 번 나온다. 입력·기기의 읽는 순서와 상관없이 늘 같은 줄이다.
 * id는 localeCompare로 견주지 않는다 — 기기의 언어 설정에 따라 순서가 달라진다.
 */
export function newestRecordFirst(a: { capturedAt: string; id: string }, b: { capturedAt: string; id: string }): number {
  const byTime = newestFirst(a.capturedAt, b.capturedAt)
  if (byTime !== 0) return byTime
  return a.id > b.id ? -1 : a.id < b.id ? 1 : 0
}
