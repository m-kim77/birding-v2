/**
 * 촬영 시각 ↔ 이동 기록의 앞뒤 점 보간 (순수). v1 `server/lib/tracklog.js`의 matchTrackPoint를 SQLite 없이 옮긴 것이다.
 *
 * 사진 촬영 시각의 바로 앞 점과 뒤 점을 찾아 두 점 사이에서 시간 비율만큼 좌표를 섞는 "보간"을 하므로,
 * 사진에 GPS가 없어도 그때 있었던 위치를 제안할 수 있다. 결과는 features/record/useTrackMatch.ts가 받아
 * 위치가 비어 있을 때만 채운다 (사용자가 고른 위치·사진 좌표를 덮지 않는다).
 *
 * v1의 SQL 조회 둘(before/after)은 정렬된 배열 + 이진탐색으로 바꿨다. 부르는 쪽(data/tracks.ts readPointsAround)은
 * 촬영일 ±1일 세 키만 읽어 넘기므로 배열은 수백 점이고 윈도우(±30분) 안은 그보다 훨씬 적다.
 * DOM·IndexedDB를 쓰지 않는다 (node --test로 검사한다).
 */
// 확장자를 적는 이유: node --test가 이 파일을 직접 읽는다 (Vite는 어느 쪽이든 된다)
import type { TrackPoint } from './points.ts'

/** 허용 간격 기본값(분). 촬영 시각 ± 이 폭 안에서만 앞뒤 점을 찾는다 */
export const DEFAULT_WINDOW_MIN = 30

/** Tier 1로 칠 수 있는 source. 정확도(< 100m) 조건과 함께 써야 한다 (tierOf) */
export const TIER1_SOURCES: ReadonlyArray<string> = ['GPS', 'WIFI', 'WIFI_ONLY']

// accuracy < 100 의 `<`는 load-bearing이다. 정확히 100인 행이 2,362개(WIFI 2,020 · CELL 232 ·
// GPS 90 · UNKNOWN 20) 있는데, CELL은 min·p50이 둘 다 100이라 100은 측정값이 아니라
// 구글의 클램프/센티넬로 보인다. `<=`로 바꾸면 Tier 1이 13,307 → 15,417로 부풀어 오른다.
/**
 * 점이 속하는 tier. 1 = GPS/WIFI/WIFI_ONLY이고 정확도가 100m 미만, 2 = timelinePath(PATH),
 * 그 밖(CELL·UNKNOWN·정확도 없음·정확도 100 이상)은 null — 어느 tier에도 들지 않아 매칭에 쓰지 않는다.
 */
export function tierOf(p: TrackPoint): 1 | 2 | null {
  if (TIER1_SOURCES.includes(p.source) && p.accuracy !== null && p.accuracy < 100) return 1
  if (p.source === 'PATH') return 2
  return null
}

/** 매칭에 쓴 이웃 점. 좌표는 넣지 않는다 — 화면은 보간된 결과만 쓴다 */
export interface TrackNeighbor {
  source: string
  /** PATH는 정확도가 없어 null */
  accuracy: number | null
  /** 촬영 시각(보정 후) 기준 초 단위 차이. before는 음수, after는 0 이상 */
  deltaSec: number
}

export type TrackMatch =
  | {
      matched: true
      lat: number
      lng: number
      /** 1 = GPS/WIFI/WIFI_ONLY(정확도 100 미만), 2 = timelinePath 폴백 */
      tier: 1 | 2
      before: TrackNeighbor
      after: TrackNeighbor
      /** before↔after 시간 간격(분, 소수 한 자리). 표시 전용 — 판정에 쓰지 않는다 */
      gapMin: number
      /** before↔after 거리(m). 표시 전용 */
      spanM: number
    }
  /** no_track = 윈도우에 아무것도 없음, one_sided = 어느 tier든 한쪽만 있음. gap_too_large는 없다 */
  | { matched: false; reason: 'no_track' | 'one_sided' }

/**
 * 두 좌표 사이의 대권 거리(m) — 하버사인, 지구를 반지름 6371km 구로 근사한다.
 * 표시용 근거(spanM)에만 쓰고 매칭 판정에는 쓰지 않는다: 근사 오차 수십 m가 tier 선택을 바꾸면 안 된다.
 * asin 인자를 1로 클램프하는 건 부동소수 오차로 sqrt(h)가 1을 아주 살짝 넘겨 NaN이 되는 걸 막기 위해서다.
 * 항상 0 이상.
 */
export function distanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** t 오름차순 배열에서 `t >= value`인 첫 인덱스 (없으면 length). 이진탐색 */
function lowerBound(points: TrackPoint[], value: number): number {
  let lo = 0
  let hi = points.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (points[mid].t < value) lo = mid + 1
    else hi = mid
  }
  return lo
}

// ⚠️ 윈도우(촬영시각 ± maxGapMin)가 유일한 간격 제약이다. 이 범위의 하한(lo)을 빼거나 폭을 넓히면
// Tier 1이 40일 전 점까지 잡아 Tier 2(PATH)가 영원히 발화하지 않는다 — v1 rev2의 사문화 버그.
//
// before는 `t < center` (엄격), after는 `t >= center` (포함). 양쪽 다 포함으로 두면 촬영 시각과
// 정확히 같은 t의 포인트가 before·after 양쪽에 동시에 뽑혀 같은 점 하나가 쌍 행세를 한다.
// 그러면 span이 0이고 ratio가 **0/0 = NaN**이라, matched:true인 채로 lat/lng가 NaN으로
// 나가 화면의 `lat.toFixed(5)`가 터진다. PATH는 시각이 분 단위 정각이라 실제로 발생한다 —
// 실측 앵커 9개 중 3개가 여기 걸린다.
// 비대칭(before만 엄격)도 임의가 아니다: AC13f2(2026-07-24T15:52:00Z)의 실측 gapMin 11.0은
// after 쪽 이웃이 deltaSec 0이어야 나온다. 거울로 뒤집으면 그 기대값이 깨진다.
// 촬영 시각과 같은 t의 점은 버려지지 않는다 — ratio가 1이 되어 그 점의 좌표가 그대로 나온다.
//
// 같은 t의 점이 여럿일 때의 순서(v1 ORDER BY의 accuracy ASC, source ASC, lat ASC, lng ASC)는 배열이
// points.ts comparePoints 순으로 정렬돼 있다는 전제로 얻는다. 그중 source는 장식이 아니다: 중복 키에
// source가 들어가 (t, lat, lng, accuracy)가 같고 source만 다른 점이 공존할 수 있어, 빠지면
// before.source가 넣은 순서에 따라 흔들린다 (AC13h).

/**
 * 윈도우 안에서 `t < center`(엄격)인 그 tier의 점 중 t가 가장 큰 것. 같은 t가 여럿이면 comparePoints 순서에서 앞선 것.
 * 배열은 오름차순이라 center 바로 앞(mid−1)에서 lo까지 거꾸로 훑는데, 같은 t 묶음은 끝에서 먼저 만나므로
 * 묶음의 앞까지 마저 봐서 앞선 것을 고른다. 없으면 null.
 */
function findBefore(points: TrackPoint[], tier: 1 | 2, lo: number, mid: number): TrackPoint | null {
  let best: TrackPoint | null = null
  for (let i = mid - 1; i >= lo; i--) {
    const p = points[i]
    if (best && p.t !== best.t) break
    if (tierOf(p) === tier) best = p
  }
  return best
}

/**
 * `center <= t <= center + win`(둘 다 포함)인 그 tier의 점 중 t가 가장 작은 것. 같은 t면 comparePoints 순서에서 앞선 것 —
 * 앞에서 뒤로 훑으므로 처음 만난 것이 그것이다. 없으면 null.
 */
function findAfter(points: TrackPoint[], tier: 1 | 2, mid: number, limit: number): TrackPoint | null {
  for (let i = mid; i < points.length && points[i].t <= limit; i++) {
    if (tierOf(points[i]) === tier) return points[i]
  }
  return null
}

/**
 * 옵션 값을 숫자로. 빈 문자열도 '값 없음'으로 본다 — Number('')는 0이고 0은 유한하므로
 * isFinite 검사만으로는 `maxGapMin: ''`이 윈도우 0으로 통과해버린다. 숫자가 아니면 기본값.
 */
function num(v: unknown, fallback: number): number {
  if (v == null || v === '') return fallback
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

/**
 * before.t < center <= after.t인 두 점 사이를 시간 비율로 보간한다. span은 항상 양수다 (0 나눗셈 없음).
 * gapMin·spanM은 사람이 볼 근거일 뿐이다.
 */
function interpolate(before: TrackPoint, after: TrackPoint, center: number, tier: 1 | 2): TrackMatch {
  const span = after.t - before.t
  const ratio = (center - before.t) / span
  const neighbor = (p: TrackPoint): TrackNeighbor => ({
    source: p.source,
    accuracy: p.accuracy,
    deltaSec: Math.round((p.t - center) / 1000),
  })
  return {
    matched: true,
    lat: before.lat + (after.lat - before.lat) * ratio,
    lng: before.lng + (after.lng - before.lng) * ratio,
    tier,
    before: neighbor(before),
    after: neighbor(after),
    gapMin: Math.round((span / 60_000) * 10) / 10,
    spanM: Math.round(distanceM(before.lat, before.lng, after.lat, after.lng)),
  }
}

/**
 * 촬영 시각 주변 윈도우에서 앞뒤 점을 찾아 선형 보간한다.
 *
 * `points`는 **points.ts의 comparePoints 순으로 정렬돼 있어야 한다** (부르는 쪽 책임 — mergeSorted·readPointsAround가 그렇게 준다).
 * 정렬이 어긋나면 이진탐색이 엉뚱한 범위를 잡아 조용히 틀린 답을 낸다.
 *
 * Tier 1이 윈도우 안에 **완전한 쌍**을 만들면 Tier 1, 아니면(아예 없든 한쪽만 있든) Tier 2로 넘어간다.
 * 한쪽만 있다고 거기서 멈추면(`break`) Tier 2가 사문화된다 — v1에서 실제로 있었던 버그라 `continue`다.
 * 실패 사유는 `no_track`(윈도우에 아무것도 없음) / `one_sided`(어느 tier든 한쪽만) 2종뿐이다 —
 * `gapMin`·`spanM`은 사람이 판단할 근거일 뿐 판정에 쓰지 않으므로 `gap_too_large`는 존재하지 않는다.
 * 한쪽만 있으면 좌표를 내놓지 않는다 (가까운 점으로 붙이지 않는다 — 보간은 두 점을 전제한다).
 *
 * @param tMs 촬영 시각 (epoch ms)
 * @param opts offsetMin: 보정 시각 = 촬영시각 + offsetMin분 (기본 0). maxGapMin: 윈도우 반폭(분, 기본 30).
 *   빈 문자열·null·NaN은 기본값이고 0은 "윈도우 없음"으로 존중한다.
 */
export function matchTrackPoint(
  points: TrackPoint[],
  tMs: number,
  opts: { offsetMin?: unknown; maxGapMin?: unknown } = {},
): TrackMatch {
  const offsetMin = num(opts.offsetMin, 0)
  // `|| 30`으로 쓰면 maxGapMin:0(윈도우 없음)이 조용히 기본값 30으로 바뀐다
  const maxGapMin = num(opts.maxGapMin, DEFAULT_WINDOW_MIN)
  const center = tMs + offsetMin * 60_000
  const win = maxGapMin * 60_000
  const lo = lowerBound(points, center - win)
  const mid = lowerBound(points, center)

  let sawAny = false
  for (const tier of [1, 2] as const) {
    const before = findBefore(points, tier, lo, mid)
    const after = findAfter(points, tier, mid, center + win)
    if (before || after) sawAny = true
    if (!before || !after) continue
    return interpolate(before, after, center, tier)
  }
  return { matched: false, reason: sawAny ? 'one_sided' : 'no_track' }
}

/**
 * 못 찾았을 때 무엇을 말할지 가르는 이유.
 * 'after-end' = 기록이 그 전에 끝났다 (새로 내보내면 있을 수 있다), 'before-start' = 그때 기록은 남아 있지 않다 (다시 내보내도 없다),
 * 'gap' = 범위 안인데 그날이 비었다 (비행기 모드 등 — 아무 권유도 하지 않는다)
 */
export type MissReason = 'after-end' | 'before-start' | 'gap'

/**
 * 촬영 시각이 이동 기록의 범위 뒤인지·앞인지·안인지. 경계값(start·end와 같은 시각)은 범위 안('gap')으로 본다.
 * range는 data/tracks.ts의 meta(rangeStart·rangeEnd)를 Date.parse한 값이다.
 */
export function explainMiss(tMs: number, range: { start: number; end: number }): MissReason {
  if (tMs > range.end) return 'after-end'
  if (tMs < range.start) return 'before-start'
  return 'gap'
}
