/**
 * 이동 기록(구글 타임라인)의 점 하나의 모양과, 점 배열을 다루는 순수 함수들.
 * 파서(parse.ts)·매칭(match.ts)·저장소(data/tracks.ts)가 함께 쓴다. DOM·IndexedDB를 쓰지 않는다 (node --test로 검사한다).
 *
 * 저장소에는 `PackedPoint`(배열)로 넣는다 — 실제 파일 53MB에서 쓰는 점은 22,426개뿐이고, 배열로 줄이면 0.8MB다.
 * 화면·매칭은 `TrackPoint`(객체)를 쓴다. 두 모양을 오가는 것은 이 파일의 pack/unpack뿐이다.
 */

export interface TrackPoint {
  /** epoch ms (UTC). 타임라인의 timestamp를 Date.parse한 값 */
  t: number
  /** 'GPS' · 'WIFI' · 'WIFI_ONLY' · 'CELL' · 'UNKNOWN' … (rawSignals의 position.source) 또는 'PATH'(semanticSegments의 timelinePath). 구글이 값을 더할 수 있어 string이다 */
  source: string
  lat: number
  lng: number
  /** 정확도(m, 반올림). timelinePath에는 없어서 null */
  accuracy: number | null
}

/** 저장소에 넣는 모양: `[t, source, lat, lng, accuracy]` */
export type PackedPoint = [t: number, source: string, lat: number, lng: number, accuracy: number | null]

/** 객체 → 저장용 배열 */
export function pack(p: TrackPoint): PackedPoint {
  return [p.t, p.source, p.lat, p.lng, p.accuracy]
}

/** 저장용 배열 → 객체 */
export function unpack(row: PackedPoint): TrackPoint {
  return { t: row[0], source: row[1], lat: row[2], lng: row[3], accuracy: row[4] }
}

/**
 * 중복 판정 키. v1의 SQLite 기본키 `(t, source, lat, lng)`와 같다 — 같은 파일을 다시 넣어도 점이 늘지 않는다.
 * 정확도는 키에 넣지 않는다 (같은 점을 정확도만 달리 두 번 넣지 않는다).
 */
export function pointKey(p: TrackPoint): string {
  return `${p.t}|${p.source}|${p.lat}|${p.lng}`
}

/**
 * 결정적 정렬: t 오름차순 → 정확도 오름차순(null이 먼저 — SQLite의 NULL 정렬과 같다) → source → lat → lng.
 * v1의 `ORDER BY t, accuracy_m ASC, source ASC, lat ASC, lng ASC`를 옮긴 것이다. source가 빠지면 같은 (t, 좌표)에 source만 다른 점이
 * 넣은 순서에 따라 앞뒤가 바뀌어 매칭 결과가 흔들린다 (v1 테스트 AC13h).
 */
export function comparePoints(a: TrackPoint, b: TrackPoint): number {
  if (a.t !== b.t) return a.t - b.t
  if (a.accuracy !== b.accuracy) {
    if (a.accuracy === null) return -1
    if (b.accuracy === null) return 1
    return a.accuracy - b.accuracy
  }
  if (a.source !== b.source) return a.source < b.source ? -1 : 1
  if (a.lat !== b.lat) return a.lat - b.lat
  return a.lng - b.lng
}

/** 점이 속한 UTC 날짜 'YYYY-MM-DD'. 저장소의 키다 — 매칭은 촬영일 ±1일 세 키만 읽는다 */
export function dayKeyOf(t: number): string {
  return new Date(t).toISOString().slice(0, 10)
}

/**
 * 있던 점 배열에 새 점을 합친다. 중복(`pointKey`)은 버리고, 결과는 `comparePoints` 순으로 정렬돼 있다.
 * `added`는 실제로 새로 들어간 수 — 같은 파일을 다시 넣으면 0이다. 입력 배열은 바꾸지 않는다.
 */
export function mergeSorted(existing: TrackPoint[], incoming: TrackPoint[]): { points: TrackPoint[]; added: number } {
  const seen = new Set(existing.map(pointKey))
  const points = [...existing]
  let added = 0
  for (const p of incoming) {
    const key = pointKey(p)
    if (seen.has(key)) continue
    seen.add(key)
    points.push(p)
    added++
  }
  points.sort(comparePoints)
  return { points, added }
}

/** UTC 날짜별로 묶는다. 각 묶음의 순서는 입력 순서 그대로다 (정렬은 mergeSorted가 한다) */
export function groupByDay(points: TrackPoint[]): Map<string, TrackPoint[]> {
  const groups = new Map<string, TrackPoint[]>()
  for (const p of points) {
    const key = dayKeyOf(p.t)
    const list = groups.get(key)
    if (list) list.push(p)
    else groups.set(key, [p])
  }
  return groups
}

/**
 * 점들의 시각 범위. 빈 배열이면 null.
 * `Math.min(...points.map())`을 쓰지 않는다 — 점이 수만 개면 스프레드가 함수 인자 개수 한계를 넘겨 RangeError로 터진다 (v1에서 실측).
 */
export function rangeOf(points: TrackPoint[]): { start: number; end: number } | null {
  let start = Infinity
  let end = -Infinity
  for (const p of points) {
    if (p.t < start) start = p.t
    if (p.t > end) end = p.t
  }
  return Number.isFinite(start) ? { start, end } : null
}
