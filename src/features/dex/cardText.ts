import { formatShot } from '../../lib/format'
import type { Sighting } from '../../types'

/**
 * 카드에 적는 글자를 만든다. 화면의 카드(BirdCard)와 내보내는 카드(cardCanvas)가 같은 글자를 쓰도록 한 곳에 둔다.
 */

/** 도감 번호를 'No. 003' 모양으로. 번호가 없는 기록(이름 미정·옛 기록)은 'No. —' */
export function dexLabel(no: number | undefined): string {
  return `No. ${no ? String(no).padStart(3, '0') : '—'}`
}

/** 카드 맨 아래의 촬영 정보 한 줄 (대문자). 촬영 정보가 없으면 빈 문자열 */
export function shotLine(s: Sighting): string {
  return formatShot({ focal_length: s.shot.focalLength, f_number: s.shot.fNumber, exposure_time: s.shot.exposureTime, iso: s.shot.iso }).toUpperCase()
}
