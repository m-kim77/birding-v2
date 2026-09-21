import { useEffect, useRef, useState } from 'react'
import { parseExif, type ExifInfo } from '../../lib/exif'
import { openOriented } from '../../lib/resize'
import type { Dimensions } from '../../types'

export interface PickedPhoto {
  file: File
  /** 화면에 보여 줄 임시 주소 */
  url: string
  /** EXIF 방향을 적용한 크기. 탐지·자르기의 좌표가 이 크기를 기준으로 한다 */
  size: Dimensions
  exif: ExifInfo
  bitmap: ImageBitmap
}

/**
 * 사진 고르기. 파일을 열어 방향을 바로잡고 EXIF를 읽는다.
 * 열 수 없는 형식(RAW 등)이면 `error`에 안내를 담고 photo는 null로 둔다. EXIF가 없는 것은 실패가 아니다 (parseExif가 {}를 준다).
 * 화면을 떠나거나 사진을 바꾸면 임시 주소와 비트맵을 놓아준다 — 원본 한 장이 수천만 픽셀이다.
 */
export function usePhotoPick() {
  const [photo, setPhoto] = useState<PickedPhoto | null>(null)
  const [error, setError] = useState('')
  const held = useRef<PickedPhoto | null>(null)

  /** 들고 있던 사진의 자원을 놓아준다 */
  function release() {
    if (!held.current) return
    URL.revokeObjectURL(held.current.url)
    held.current.bitmap.close()
    held.current = null
  }
  useEffect(() => release, [])

  /** 파일을 받아 연다. 실패해도 던지지 않는다 */
  async function pick(file: File) {
    setError('')
    try {
      const [bitmap, exif] = await Promise.all([openOriented(file), parseExif(file)])
      release()
      held.current = { file, url: URL.createObjectURL(file), size: { width: bitmap.width, height: bitmap.height }, exif, bitmap }
      setPhoto(held.current)
    } catch (e) {
      setError(e instanceof Error ? e.message : '사진을 열지 못했습니다.')
    }
  }

  return { photo, error, pick }
}
