import exifr from 'exifr'

export interface ExifInfo {
  lat?: number
  lng?: number
  /** UTC 정규형 ISO 문자열. 참 wall-clock + 참 오프셋으로 계산해 런타임 TZ에 의존하지 않는다 */
  capturedAt?: string
  /** '+09:00' — captured_at과 합성해 촬영지 시각을 복원하는 표시용 키 */
  capturedAtOffset?: string
  /** true면 오프셋이 EXIF가 아니라 브라우저 TZ에서 가정된 값이다 (UI에 명시하고 수정 가능해야 한다) */
  offsetAssumed?: boolean
  /** EXIF 원문 wall-clock (`'2026:08:02 11:47:39'`). 사람이 오프셋을 고칠 때 UTC를 다시 계산하는 원본이다 */
  capturedWall?: string
  /** SubSecTimeOriginal 원문 (`'734'`) */
  capturedSubSec?: string
  cameraMake?: string
  cameraModel?: string
  lensModel?: string
  /** mm */
  focalLength?: number
  /** f/6.3 → 6.3 */
  fNumber?: number
  /** 초 단위. 1/200s → 0.005 */
  exposureTime?: number
  iso?: number
  /** XMP — 원본 RAW 파일명 (예: 'DSC08388.ARW') */
  rawFileName?: string
  /** XMP — 별점 0~5 */
  rating?: number
}

/**
 * '+0900' basic format과 'Z'를 '+09:00' / '+00:00' 확장 형식으로 정규화한다.
 * '+09'(시간만)는 EXIF OffsetTime 규격 위반이므로 받아들이지 않고 null을 반환한다.
 */
export function normalizeOffset(value: unknown): string | null {
  const s = String(value ?? '').trim()
  if (!s) return null
  if (s === 'Z' || s === 'z') return '+00:00'
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(s)
  if (!m) return null
  const hh = Number(m[2])
  const mm = Number(m[3])
  if (hh > 14 || mm > 59) return null
  return `${m[1]}${m[2]}:${m[3]}`
}

/**
 * 촬영일 기준 브라우저 로컬 오프셋을 '+09:00' 형식으로 만든다.
 * getTimezoneOffset()은 UTC 서쪽이 **양수**라 부호를 뒤집어야 하고 (안 뒤집으면 서울에서 18시간 오차),
 * '지금'이 아니라 **촬영일**의 오프셋을 써야 여름/겨울 시간대가 섞이지 않는다.
 * 정오를 기준으로 삼아 DST 전환 경계 자체를 피한다.
 */
export function browserOffsetFor(year: number, month: number, day: number): string {
  const off = -new Date(year, month - 1, day, 12).getTimezoneOffset()
  const sign = off >= 0 ? '+' : '-'
  const abs = Math.abs(off)
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`
}

/**
 * EXIF 원문 문자열에서 촬영 순간을 UTC 정규형으로 확정한다.
 *
 * `reviveValues:false`로 받은 `"2026:08:02 11:47:39"` 원문이 참 wall-clock이고,
 * `OffsetTimeOriginal`이 참 오프셋이다. 둘을 합쳐 UTC로 계산하므로 런타임 TZ가 개입하지 않는다
 * (Date는 여기서 딱 한 번, 산술용으로만 쓴다).
 * 날짜 태그가 없거나 형식이 어긋나면 `{ assumed: false }` — 예외를 던지지 않는다.
 */
export function buildCapturedAt(d: Record<string, unknown>): {
  capturedAt?: string
  offset?: string
  assumed: boolean
} {
  const raw = d.DateTimeOriginal ?? d.CreateDate
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(raw ?? ''))
  if (!m) return { assumed: false }
  const [, Y, Mo, D, h, mi, s] = m
  // SubSecTimeOriginal은 reviver가 없어 원래부터 ASCII 문자열("734")이다
  const ms =
    d.SubSecTimeOriginal != null
      ? String(d.SubSecTimeOriginal).padEnd(3, '0').slice(0, 3)
      : '000'
  const explicit = normalizeOffset(d.OffsetTimeOriginal)
  const assumed = explicit === null
  const offset = explicit ?? browserOffsetFor(Number(Y), Number(Mo), Number(D))
  const at = new Date(`${Y}-${Mo}-${D}T${h}:${mi}:${s}.${ms}${offset}`)
  if (Number.isNaN(at.getTime())) return { assumed: false }
  return { capturedAt: at.toISOString(), offset, assumed }
}

/**
 * 사람이 고친 오프셋으로 촬영 순간을 다시 계산한다.
 *
 * **wall-clock은 그대로 두고 오프셋만 바꾼다** — 카메라가 가리킨 시각(11:47)은 보존되고 UTC만 이동한다.
 * 오프셋만 갈아끼우고 `capturedAt`을 그대로 두면 저장된 순간이 통째로 틀어진다
 * (실측: 가정 `+09:00` → 사람이 `-04:00`으로 정정 시 **13시간** 오차 + 표시 날짜가 하루 밀림).
 * 오프셋 형식이 어긋나면 null — 호출부는 기존 값을 유지해야 한다 (타이핑 중간값을 커밋하지 않는다).
 */
export function recomputeCapturedAt(
  wall: string,
  subSec: string | null,
  offset: string,
): { capturedAt: string; offset: string } | null {
  const normalized = normalizeOffset(offset)
  if (!normalized) return null
  const r = buildCapturedAt({
    DateTimeOriginal: wall,
    SubSecTimeOriginal: subSec ?? undefined,
    OffsetTimeOriginal: normalized,
  })
  return r.capturedAt ? { capturedAt: r.capturedAt, offset: normalized } : null
}

const num = (v: unknown): number | undefined => {
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}
const str = (v: unknown): string | undefined => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s || undefined
}

/**
 * 이미지 File에서 GPS · 촬영 시각 · 카메라/렌즈/촬영설정을 파싱한다.
 * EXIF가 없거나 파싱이 실패하면 {} 를 반환 (에러 전파하지 않음).
 */
export async function parseExif(file: File): Promise<ExifInfo> {
  const info: ExifInfo = {}
  try {
    // exifr.gps()는 highlevel/gps의 독립 옵션 경로라 아래 parse()의 reviveValues:false에
    // 영향받지 않는다 — 그래서 parse 옵션에 gps:true를 넣지 않고 별도 호출을 유지한다.
    const [gps, d] = await Promise.all([
      exifr.gps(file),
      // reviveValues:false — 날짜 태그를 Date로 되살리지 않고 원문 문자열로 받는다.
      // exifr의 reviver는 new Date(y,m,d) 후 setter로 시·분·초를 얹기 때문에 DST 봄철
      // 건너뛴 wall-clock(예: NY 2026-03-08 02:30)이 03:30으로 정규화돼 조용히 1시간 밀린다.
      // 부수효과(향후 필드 추가 시 함정): ExifImageWidth/Height가 스칼라 대신 배열로,
      // ComponentsConfiguration/ExifVersion이 raw 바이트로 온다. 아래 숫자 필드는 영향 없음.
      exifr.parse(file, {
        tiff: true,
        exif: true,
        xmp: true,
        iptc: true,
        mergeOutput: true,
        reviveValues: false,
      }),
    ])
    if (typeof gps?.latitude === 'number' && typeof gps?.longitude === 'number') {
      info.lat = gps.latitude
      info.lng = gps.longitude
    }
    if (!d) return info

    const { capturedAt, offset, assumed } = buildCapturedAt(d)
    if (capturedAt) {
      info.capturedAt = capturedAt
      info.capturedAtOffset = offset
      info.offsetAssumed = assumed
      info.capturedWall = String(d.DateTimeOriginal ?? d.CreateDate)
      info.capturedSubSec = d.SubSecTimeOriginal != null ? String(d.SubSecTimeOriginal) : undefined
    }
    info.cameraMake = str(d.Make)
    info.cameraModel = str(d.Model)
    // LensModel은 표준 EXIF 태그, Lens(0xfdea)는 일부 기종의 대체 태그다
    info.lensModel = str(d.LensModel) ?? str(d.Lens)
    info.focalLength = num(d.FocalLength)
    info.fNumber = num(d.FNumber)
    info.exposureTime = num(d.ExposureTime)
    info.iso = num(d.ISO)
    info.rawFileName = str(d.RawFileName)
    info.rating = num(d.Rating)
  } catch {
    /* EXIF 없음 또는 파싱 실패 — 지금까지 채운 값만 반환 */
  }
  return info
}
