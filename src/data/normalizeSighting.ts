import type { CardStyle, CardTier, IdentifyStatus, LocationSource, NormalizedBox, Reference, ShotInfo, Sighting, Stamp, Verdict } from '../types'

/**
 * 바깥에서 온 기록(백업 파일·기기 DB)을 화면이 믿고 쓸 수 있는 모양으로 맞춘다. 순수 함수다 (node --test로 검사한다).
 *
 * 앱이 만든 기록은 늘 온전하다. 빈 칸이 생기는 길은 손으로 고친 백업, 다른 판의 앱, v1 가져오기의 변환 실수,
 * 그리고 **앞으로 필드를 더했을 때의 옛 기록**이다 — 빈 칸 하나가 목록 정렬·상세 화면을 멈추면 첫 화면부터 못 연다.
 * 고칠 수 없는 것(id, 읽을 수 있는 시각)이 없으면 null, 나머지 빈 칸은 기본값을 채우고 모양이 틀린 선택 필드는 뗀다.
 * 모르는 키는 그대로 둔다 (가산 확장 — 새 판이 더한 키를 옛 판이 지우면 안 된다).
 */
export function normalizeSighting(raw: unknown): Sighting | null {
  if (!isObject(raw)) return null
  const id = str(raw.id)
  // 촬영 시각이 없으면 기록한 시각, 그것도 없으면 고친 시각 — 셋 다 못 읽으면 어느 날의 기록인지 알 수 없다
  const capturedAt = [raw.capturedAt, raw.createdAt, raw.updatedAt].find(isTime) as string | undefined
  if (!id || !capturedAt) return null
  const createdAt = isTime(raw.createdAt) ? raw.createdAt : capturedAt
  const [lat, lng] = typeof raw.lat === 'number' && typeof raw.lng === 'number' && Number.isFinite(raw.lat) && Number.isFinite(raw.lng) ? [raw.lat, raw.lng] : [null, null]
  const speciesKo = str(raw.speciesKo)
  const s: Sighting = {
    ...(raw as Partial<Sighting>),
    id, speciesKo, capturedAt, createdAt,
    latin: str(raw.latin),
    capturedAtOffset: typeof raw.capturedAtOffset === 'string' && /^[+-]\d\d:\d\d$/.test(raw.capturedAtOffset) ? raw.capturedAtOffset : null,
    updatedAt: isTime(raw.updatedAt) ? raw.updatedAt : createdAt,
    place: str(raw.place),
    lat, lng,
    locationSource: oneOf<LocationSource>(raw.locationSource, ['exif', 'tracklog', 'gps', 'manual', 'none'], 'none'),
    shot: shotOf(raw.shot),
    note: str(raw.note),
    cropBox: boxOf(raw.cropBox),
    detectorModel: typeof raw.detectorModel === 'string' ? raw.detectorModel : null,
    tier: oneOf<CardTier>(raw.tier, [1, 2, 3, 4], 1),
    stamps: Array.isArray(raw.stamps) ? raw.stamps.filter((x): x is Stamp => ['천연기념물', '멸종위기', '길잃은새'].includes(x as string)) : [],
    sensitive: raw.sensitive === true,
    identify: oneOf<IdentifyStatus>(raw.identify, ['none', 'waiting', 'done'], speciesKo ? 'done' : 'none'),
    fromSound: raw.fromSound === true,
  }
  // 선택 필드는 모양이 맞을 때만 남긴다 — 틀린 값을 두면 카드·판정 화면이 그 값을 믿고 읽다 멈춘다
  setOrDrop(s, 'cardStyle', cardStyleOf(raw.cardStyle))
  setOrDrop(s, 'verdict', verdictOf(raw.verdict))
  setOrDrop(s, 'dexNo', Number.isInteger(raw.dexNo) && (raw.dexNo as number) > 0 ? raw.dexNo as number : undefined)
  return s
}

/** 값이 있으면 넣고, 없으면 키 자체를 지운다 (undefined 값을 남기지 않는다) */
function setOrDrop<K extends 'cardStyle' | 'verdict' | 'dexNo'>(s: Sighting, key: K, value: Sighting[K] | undefined) {
  if (value === undefined) delete s[key]
  else s[key] = value
}

/** 촬영 정보는 아는 키 중 타입이 맞는 것만. 없거나 틀리면 {} (값이 없는 항목은 키가 없는 약속) */
function shotOf(v: unknown): ShotInfo {
  if (!isObject(v)) return {}
  const out: ShotInfo = {}
  for (const k of ['cameraModel', 'lensModel'] as const) if (typeof v[k] === 'string') out[k] = v[k] as string
  for (const k of ['focalLength', 'fNumber', 'exposureTime', 'iso'] as const) if (typeof v[k] === 'number' && Number.isFinite(v[k])) out[k] = v[k] as number
  return out
}

/** 네 값이 모두 0~1 숫자인 상자만. 아니면 null (잘라낸 영역 없음으로 읽는다) */
function boxOf(v: unknown): NormalizedBox | null {
  if (!isObject(v)) return null
  const ok = (['x1', 'y1', 'x2', 'y2'] as const).every((k) => typeof v[k] === 'number' && (v[k] as number) >= 0 && (v[k] as number) <= 1)
  return ok ? { x1: v.x1 as number, y1: v.y1 as number, x2: v.x2 as number, y2: v.y2 as number } : null
}

/** '#RRGGBB' 강조색과 빛 여부가 맞을 때만. 아니면 undefined — 카드가 옛 tier의 색으로 읽는다 */
function cardStyleOf(v: unknown): CardStyle | undefined {
  if (!isObject(v) || typeof v.accent !== 'string' || !/^#[0-9a-f]{6}$/i.test(v.accent)) return undefined
  return { accent: v.accent, glow: v.glow === true }
}

/**
 * 판정은 '확정'/'좁힘'과 이름(국명이나 학명)이 있을 때만 남긴다. 근거·후보·자료는 모양이 맞는 것만 추린다.
 * `references` 키가 없던 옛 판정은 없는 채로 둔다 — "자료를 확인하지 않았다"와 "모른다"를 가르는 표지다 (VerdictDetails).
 */
function verdictOf(v: unknown): Verdict | undefined {
  if (!isObject(v) || (v.kind !== '확정' && v.kind !== '좁힘')) return undefined
  const speciesKo = str(v.speciesKo)
  const latin = str(v.latin)
  if (!speciesKo && !latin) return undefined
  const evidence = Array.isArray(v.evidence) ? v.evidence.filter(isObject).map((e) => ({ text: str(e.text), source: str(e.source) })).filter((e) => e.text) : []
  const out: Verdict = {
    kind: v.kind, speciesKo, latin, summary: str(v.summary), evidence,
    others: Array.isArray(v.others) ? v.others.filter((o): o is string => typeof o === 'string' && o !== '') : [],
    model: str(v.model),
  }
  if (Array.isArray(v.references)) {
    out.references = v.references.filter(isObject).filter((r) => typeof r.title === 'string' && typeof r.url === 'string')
      .map((r): Reference => ({ title: r.title as string, url: r.url as string, ...(typeof r.image === 'string' ? { image: r.image } : {}) }))
  }
  return out
}

/** 목록에 든 값이면 그대로, 아니면 기본값 */
function oneOf<T>(v: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(v as T) ? v as T : fallback
}

/** 날짜로 읽히는 글자인지 (정렬·표시가 멈추지 않을 값인지) */
function isTime(v: unknown): v is string {
  return typeof v === 'string' && v !== '' && !Number.isNaN(Date.parse(v))
}

/** 배열이 아닌 객체인지 */
function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** 글자가 아니면 빈 문자열 */
function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/** 시각을 하나도 읽을 수 없는 기기 기록에 넣는 자리표 — 목록 맨 끝(1970년)에 보여서 눈에 띄고, 정렬은 멈추지 않는다 */
const UNKNOWN_TIME = '1970-01-01T00:00:00.000Z'

/**
 * 기기 DB에서 읽은 기록을 맞춘다. 백업과 달리 **버리지 않는다** — 이미 들어온 기록을 말없이 숨기면 유실이다.
 * 시각이 하나도 없으면 UNKNOWN_TIME으로 채운다. 객체가 아니거나 id가 없으면(DB 열쇠라 사실상 없다) 그릴 수 없어 null.
 */
export function normalizeStored(raw: unknown): Sighting | null {
  return normalizeSighting(raw) ?? (isObject(raw) ? normalizeSighting({ ...raw, capturedAt: UNKNOWN_TIME }) : null)
}
