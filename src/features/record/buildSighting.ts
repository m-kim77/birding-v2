import { latinOf } from '../../data/species'
import type { ExifInfo } from '../../lib/exif'
import type { NormalizedBox, ShotInfo, Sighting, Verdict } from '../../types'
import { dexNoFor, tierFor } from '../dex/cardTier'
import type { PlaceValue } from './usePlace'

interface Input {
  name: string
  note: string
  exif: ExifInfo
  place: PlaceValue
  crop: { box: NormalizedBox; by: string } | null
  verdict: Verdict | null
  existing: Sighting[]
  now: Date
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
 * 화면의 입력으로 기록 한 건을 만든다. 순수 함수다 (시각과 기존 기록을 밖에서 받는다).
 * - 촬영 시각이 없는 사진은 기록한 시각을 쓴다.
 * - 학명은 AI의 이름을 그대로 받아들였으면 AI의 것을, 아니면 종 표에서 찾는다.
 * - AI 근거는 사용자가 그 이름을 그대로 받아들였을 때만 남긴다. 직접 고친 이름에 AI 근거를 붙이면 거짓이 된다.
 */
export function buildSighting(input: Input): Sighting {
  const name = input.name.trim()
  const accepted = input.verdict && (input.verdict.speciesKo || input.verdict.latin) === name ? input.verdict : null
  const stamp = input.now.toISOString()
  const capturedAt = input.exif.capturedAt ?? stamp
  return {
    id: crypto.randomUUID(), speciesKo: name, latin: accepted ? accepted.latin : latinOf(name),
    capturedAt, capturedAtOffset: input.exif.capturedAtOffset ?? null, createdAt: stamp, updatedAt: stamp,
    place: input.place.name, lat: input.place.lat, lng: input.place.lng, locationSource: input.place.source,
    shot: shotOf(input.exif), note: input.note.trim(),
    cropBox: input.crop?.box ?? null, detectorModel: input.crop?.by ?? null,
    tier: tierFor(name, capturedAt, [], input.existing), stamps: [], sensitive: false,
    identify: name ? 'done' : 'none', verdict: accepted ?? undefined, fromSound: false, dexNo: dexNoFor(name, input.existing),
  }
}
