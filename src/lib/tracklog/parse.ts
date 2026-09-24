/**
 * 구글 타임라인 JSON → 이동 기록 점 배열 (순수). v1 `server/lib/tracklog.js`의 parseCoord·extractPoints를 옮긴 것이다.
 * DOM·IndexedDB를 쓰지 않는다 (node --test로 검사한다). 53MB짜리 실제 파일의 JSON.parse는 워커(features/tracks/parseWorker.ts)가 부른다.
 *
 * 시간대 변환은 없다 — 타임라인의 timestamp도 사진의 capturedAt(lib/exif.ts, UTC Z)도 Date.parse로 epoch ms가 된다.
 * 아이폰 내보내기는 모양이 다르다는 비공식 보고(최상위가 배열, 좌표가 geo: URI, placeID)만 있어 아직 읽지 않는다 —
 * 읽게 되면 detectShape·extractPoints에 갈래를 더한다.
 */
// 확장자를 적는 이유: node --test가 이 파일을 직접 읽는다 (Vite는 어느 쪽이든 된다)
import type { TrackPoint } from './points.ts'

/**
 * 구글 타임라인의 좌표 문자열을 파싱한다 — `"37.5665000°, 126.9780000°"`.
 * 앞뒤·도 기호 주변 공백과 음수 부호를 허용한다. 형식이 어긋나면 null (예외를 던지지 않는다).
 */
export function parseCoord(value: unknown): { lat: number; lng: number } | null {
  const m = /(-?[\d.]+)\s*°\s*,\s*(-?[\d.]+)\s*°/.exec(String(value ?? ''))
  if (!m) return null
  const lat = Number(m[1])
  const lng = Number(m[2])
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
}

/** 'android' = 읽을 수 있는 모양, 'iphone' = 모양이 달라 아직 못 읽는다, 'unknown' = 타임라인이 아니다 */
export type TimelineShape = 'android' | 'iphone' | 'unknown'

/**
 * 타임라인 JSON의 모양을 가른다.
 * 최상위가 배열이면 'iphone' (비공식 보고: 최상위 배열, 좌표가 geo: URI, placeID),
 * 객체이고 rawSignals 또는 semanticSegments가 배열이면 'android', 그 밖(null·문자열·빈 객체)은 'unknown'.
 */
export function detectShape(json: unknown): TimelineShape {
  if (Array.isArray(json)) return 'iphone'
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>
    if (Array.isArray(o.rawSignals) || Array.isArray(o.semanticSegments)) return 'android'
  }
  return 'unknown'
}

/**
 * rawSignals 항목 하나 → 점. position이 없는 신호(wifiScan·activityRecord)와
 * LatLng 형식이 어긋나거나 timestamp를 못 읽는 항목은 null (그 점만 건너뛴다).
 * 정확도는 유한하면 반올림, 아니면 null.
 */
function pointFromSignal(signal: unknown): TrackPoint | null {
  const p = (signal as { position?: Record<string, unknown> } | null)?.position
  if (!p) return null
  const coord = parseCoord(p.LatLng)
  const t = Date.parse(String(p.timestamp))
  if (!coord || Number.isNaN(t)) return null
  const accuracy = Number(p.accuracyMeters)
  return {
    t,
    source: String(p.source ?? 'UNKNOWN'),
    lat: coord.lat,
    lng: coord.lng,
    accuracy: Number.isFinite(accuracy) ? Math.round(accuracy) : null,
  }
}

/**
 * semanticSegments 항목 하나 → timelinePath의 점들. timelinePath가 없는 구간(visit·activity·timelineMemory)은 빈 배열.
 * 형식이 어긋나는 걸음은 그 걸음만 건너뛴다.
 */
function pointsFromSegment(segment: unknown): TrackPoint[] {
  const path = (segment as { timelinePath?: unknown } | null)?.timelinePath
  if (!Array.isArray(path)) return []
  const points: TrackPoint[] = []
  for (const step of path as Array<Record<string, unknown> | null>) {
    const coord = parseCoord(step?.point)
    const t = Date.parse(String(step?.time))
    if (!coord || Number.isNaN(t)) continue
    // timelinePath에는 정확도가 없다 — null로 두고 Tier 2(PATH)로만 쓴다
    points.push({ t, source: 'PATH', lat: coord.lat, lng: coord.lng, accuracy: null })
  }
  return points
}

/**
 * 타임라인 JSON 객체에서 점을 뽑는다.
 * `rawSignals[].position`을 먼저, `semanticSegments[].timelinePath[]`를 나중에 담는다 (정렬은 points.ts의 mergeSorted가 한다).
 * 아이폰 모양이면 "아직 읽지 못한다"고 던지고, 두 배열이 모두 없으면 실제 최상위 키를 담은 Error를 던지고,
 * 좌표가 한 점도 안 나와도 던진다 — 조용히 0건을 성공으로 돌려주면 형식 변경을 아무도 눈치채지 못한다.
 */
export function extractPoints(json: unknown): TrackPoint[] {
  const shape = detectShape(json)
  if (shape === 'iphone') {
    throw new Error('아이폰에서 내보낸 파일은 아직 읽지 못합니다. 지금은 안드로이드에서 내보낸 타임라인 파일만 읽습니다.')
  }
  const keys = json && typeof json === 'object' ? Object.keys(json) : []
  if (shape === 'unknown') {
    // 최상위 키는 진단용이다 — 구글이 형식을 바꾸면 사용자가 보내 준 이 한 줄로 무엇이 왔는지 안다
    throw new Error(`이 파일에서 위치 기록을 찾지 못했습니다 — 폰의 타임라인에서 내보낸 파일인지 확인해 주세요 (최상위 키: ${keys.join(', ') || '(없음)'})`)
  }
  const o = json as Record<string, unknown>
  const rawSignals = Array.isArray(o.rawSignals) ? o.rawSignals : []
  const segments = Array.isArray(o.semanticSegments) ? o.semanticSegments : []

  const points: TrackPoint[] = []
  for (const signal of rawSignals) {
    const p = pointFromSignal(signal)
    if (p) points.push(p)
  }
  for (const segment of segments) points.push(...pointsFromSegment(segment))

  if (points.length === 0) {
    throw new Error(`좌표를 한 점도 찾지 못했습니다. 최상위 키: ${keys.join(', ')}`)
  }
  return points
}

/**
 * 파일 본문(문자열) → 점 배열. JSON이 아니면 한국어 Error를 던지고, JSON이면 extractPoints의 예외를 그대로 낸다.
 * 부르는 쪽(워커)이 메시지를 화면에 그대로 보여 준다.
 */
export function parseTimelineText(text: string): TrackPoint[] {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error('타임라인 파일을 읽지 못했습니다 (JSON 형식이 아닙니다).')
  }
  return extractPoints(json)
}
