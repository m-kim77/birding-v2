import type { ExifInfo } from '../../lib/exif'
import type { CardStyle, NormalizedBox, ShotInfo, Sighting, Verdict } from '../../types'
// 확장자를 적는 이유: node --test가 이 파일을 직접 읽는다 (Vite는 어느 쪽이든 된다)
import { countOf } from '../../lib/count.ts'
import { nameFields } from './nameFields.ts'
import type { PlaceValue } from './usePlace'

interface Input {
  name: string
  note: string
  exif: ExifInfo
  place: PlaceValue
  crop: { box: NormalizedBox; by: string } | null
  verdict: Verdict | null
  /** 카드 색. 사진에서 뽑은 것을 밖에서 넣는다 (여기는 순수 함수라 캔버스를 쓰지 않는다) */
  cardStyle: CardStyle
  now: Date
  /** 본 개체 수 (입력칸을 parseCount로 읽은 값). 없으면 세지 않은 것 — 기록에 키를 만들지 않는다 */
  count?: number
}

/** EXIF에서 기록에 남길 촬영 정보만 고른다. 없는 값은 키를 만들지 않는다 */
function shotOf(exif: ExifInfo): ShotInfo {
  const shot: ShotInfo = {}
  if (exif.cameraModel) shot.cameraModel = exif.cameraModel
  if (exif.lensModel) shot.lensModel = exif.lensModel
  if (exif.focalLength) shot.focalLength = exif.focalLength
  if (exif.fNumber) shot.fNumber = exif.fNumber
  if (exif.exposureTime) shot.exposureTime = exif.exposureTime
  if (exif.iso) shot.iso = exif.iso
  return shot
}

/**
 * 화면의 입력으로 기록 한 건을 만든다. 순수 함수다 (시각을 밖에서 받는다).
 * - 촬영 시각이 없는 사진은 기록한 시각을 쓴다.
 * - 개체 수는 1 이상의 정수일 때만 키를 만든다 (lib/count.ts) — 없으면 '세지 않음'이다.
 * - 이름·학명·AI 근거·이름이 붙은 시각은 nameFields가 정한다 (도감 번호는 저장하지 않는다 — dex/dexNo.ts) — AI 근거는 사용자가 그 이름을 그대로 받아들였을 때만 남고,
 *   국명을 확인하지 못한 판정은 이름 없이 저장해도 학명·근거를 붙이지 않는다 (작업 20).
 */
export function buildSighting(input: Input): Sighting {
  const stamp = input.now.toISOString()
  const capturedAt = input.exif.capturedAt ?? stamp
  const count = countOf(input.count)
  return {
    id: crypto.randomUUID(), ...nameFields(input.name, input.verdict, input.now),
    capturedAt, capturedAtOffset: input.exif.capturedAtOffset ?? null, createdAt: stamp, updatedAt: stamp,
    place: input.place.name, lat: input.place.lat, lng: input.place.lng, locationSource: input.place.source,
    shot: shotOf(input.exif), note: input.note.trim(),
    cropBox: input.crop?.box ?? null, detectorModel: input.crop?.by ?? null,
    // tier는 옛 백업 호환용으로만 남았다 — 새 기록은 늘 1 (types.ts)
    tier: 1, cardStyle: input.cardStyle, stamps: [], sensitive: false,
    fromSound: false,
    ...(count !== undefined ? { count } : {}),
  }
}
