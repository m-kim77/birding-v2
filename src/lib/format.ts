/** '+09:00' → 540. 형식이 어긋나면 null. */
function offsetToMinutes(offset: string): number | null {
  const m = /^([+-])(\d{2}):(\d{2})$/.exec(offset)
  if (!m) return null
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]))
}

/** 촬영지 시각의 달력 구성요소 */
export interface ZonedParts {
  year: number
  /** 1~12 */
  month: number
  day: number
  hour: number
  minute: number
}

/** Date를 뷰어 로컬 시각의 구성요소로. 오프셋을 모를 때의 폴백. */
export function localParts(d: Date): ZonedParts {
  return {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
    hour: d.getHours(),
    minute: d.getMinutes(),
  }
}

/**
 * UTC 정규형 ISO와 촬영지 오프셋을 합성해 **촬영지 시각**의 구성요소를 낸다.
 * `offset`이 null이거나 형식이 어긋나면 뷰어 로컬 시각으로 떨어진다 (기존 동작).
 * ISO 자체가 파싱되지 않으면 null.
 */
export function zonedParts(iso: string, offset: string | null): ZonedParts | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const minutes = offset ? offsetToMinutes(offset) : null
  if (minutes === null) return localParts(d)
  // 오프셋만큼 밀어 놓고 UTC getter로 읽으면 그 오프셋의 wall-clock이 나온다 — 런타임 TZ 무관
  const s = new Date(d.getTime() + minutes * 60_000)
  return {
    year: s.getUTCFullYear(),
    month: s.getUTCMonth() + 1,
    day: s.getUTCDate(),
    hour: s.getUTCHours(),
    minute: s.getUTCMinutes(),
  }
}

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * 목업 스타일의 메타 형식: `2026.08.24 06:42`.
 * `offset`은 optional이 아니라 **필수·nullable**이다 — optional이면 소비처가 인자를 빼먹어도
 * 컴파일러가 침묵해 뷰어 시계로 조용히 되돌아간다. 파싱 실패 시 입력 문자열을 그대로 돌려준다.
 */
export function formatMeta(iso: string, offset: string | null): string {
  const p = zonedParts(iso, offset)
  if (!p) return iso
  return `${p.year}.${pad(p.month)}.${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}`
}

/** 목업 스타일의 좌표 형식: 38.0692°N 128.1704°E */
export function formatCoords(lat: number, lng: number): string {
  const ns = lat >= 0 ? 'N' : 'S'
  const ew = lng >= 0 ? 'E' : 'W'
  return `${Math.abs(lat).toFixed(4)}°${ns} ${Math.abs(lng).toFixed(4)}°${ew}`
}

/**
 * 값을 1% 안에서 되살릴 수 있는 **가장 짧은 소수 표현**을 고른다 (0→1→2→3자리 순).
 * 표시는 짧을수록 좋지만 짧게 자르다 값이 틀어지면 안 되므로, 0.5% 오차 안에 드는 첫 자리수에서 멈춘다.
 */
function shortestDecimal(value: number): number {
  for (const digits of [0, 1, 2, 3]) {
    const rounded = Number(value.toFixed(digits))
    if (rounded !== 0 && Math.abs(rounded - value) / value <= 0.005) return rounded
  }
  return Number(value.toFixed(4))
}

/** 역수 표기를 포기하는 경계. 1/1.0x는 사람이 읽는 표기가 아니다 (`1/1s`가 대표적) */
const MIN_RECIPROCAL = 1.05

/**
 * 셔터 속도(초) → 카메라 표기. 1초 미만은 `1/200s`·`1/2.5s`, 1초 이상은 `2s`·`1.25s`.
 *
 * **역수를 정수로 반올림하지 않는다.** 예전 구현은 `1/Math.round(1/s)`라서 0.4초가 `1/3s`(=0.333초)로,
 * 0.7초와 0.8초가 **둘 다 `1/1s`** 로 나왔다 — 값이 틀리고 표기도 말이 안 됐다.
 * 새벽·해질녘의 1/3스톱 구간(0.4~0.8초)이 통째로 여기 걸린다.
 * 역수가 `MIN_RECIPROCAL` 미만이면 초 표기로 떨어뜨려 `1/1s`가 나올 길을 막는다.
 *
 * **양수만 받는다.** 0이나 음수는 호출부(`formatShot`)가 걸러야 한다 —
 * 셔터 칸은 사람이 직접 고칠 수 있어 0이 실제로 들어온다.
 */
export function formatExposure(seconds: number): string {
  const reciprocal = 1 / seconds
  if (seconds < 1 && reciprocal >= MIN_RECIPROCAL) return `1/${shortestDecimal(reciprocal)}s`
  return `${shortestDecimal(seconds)}s`
}

/**
 * 카메라 표기를 초 단위 숫자로 되돌린다 — `formatExposure`의 역함수.
 * `'1/200'` `'1/200s'` `'1/2.5s'` `'0.005'` `'2'` `'2s'` `'2"'` 를 받는다.
 * 빈 문자열·깨진 입력·0 이하는 `null` (저장하면 안 되는 값이므로 조용히 0으로 만들지 않는다).
 */
export function parseExposure(text: string): number | null {
  const s = String(text ?? '').trim().replace(/[s"″]\s*$/i, '').trim()
  if (!s) return null
  const fraction = /^1\s*\/\s*([\d.]+)$/.exec(s)
  const value = fraction ? 1 / Number(fraction[1]) : Number(s)
  if (!Number.isFinite(value) || value <= 0) return null
  return value
}

/** formatShot이 받는 촬영 설정. 없는 항목은 표시에서 통째로 빠진다. */
export interface ShotSettings {
  focal_length?: number | null
  f_number?: number | null
  exposure_time?: number | null
  iso?: number | null
}

/**
 * 촬영 설정을 한 줄로 — `400mm · f/6.3 · 1/200s · ISO 1000`.
 * 값이 없는 항목은 생략하고, 전부 없으면 빈 문자열을 반환한다 (호출부에서 그대로 숨기면 된다).
 */
export function formatShot(s: ShotSettings): string {
  // 네 값 모두 물리적으로 양수다. 사람이 고칠 수 있는 칸이라 0이나 음수가 들어올 수 있는데,
  // 그대로 넘기면 셔터가 `1/Infinitys`, 조리개가 `f/0` 같은 값으로 렌더된다 — 그 칸을 통째로 뺀다.
  const has = (v: number | null | undefined): v is number => v != null && v > 0
  const parts: string[] = []
  if (has(s.focal_length)) parts.push(`${Number(s.focal_length.toFixed(1))}mm`)
  if (has(s.f_number)) parts.push(`f/${Number(s.f_number.toFixed(1))}`)
  if (has(s.exposure_time)) parts.push(formatExposure(s.exposure_time))
  if (has(s.iso)) parts.push(`ISO ${s.iso}`)
  return parts.join(' · ')
}

/**
 * 저장할 셔터 값을 고른다. **표시값을 되파싱하지 않는 것이 요점이다.**
 *
 * 화면에는 카메라 표기(`1/1.3s`)를 보여주지만 그건 반올림된 값이라, 사용자가 손대지도 않은 칸을
 * 표기에서 되돌려 저장하면 EXIF 원본이 조용히 틀어진다. 그래서 사람이 그 칸을 **실제로 고쳤을 때만**
 * 파싱하고, 아니면 원본 숫자를 그대로 내보낸다.
 *
 * @param raw EXIF에서 읽은 원본 초 단위 값 (없으면 null)
 * @param displayed 입력칸에 보이는 문자열
 * @param edited 사용자가 그 칸을 고쳤는지
 */
export function exposureToSave(raw: number | null, displayed: string, edited: boolean): number | null {
  return edited ? parseExposure(displayed) : raw
}
