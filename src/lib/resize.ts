import { fitLongEdge } from './crop'

/** 기기에 보관하는 "큰 판"의 긴 변. 원본(수천만 화소)을 그대로 두면 수백 장에서 저장소가 찬다 */
export const FULL_MAX_EDGE = 2048
/** 목록·지도용 작은 판 */
export const THUMB_MAX_EDGE = 480

/**
 * 비트맵을 긴 변 `maxEdge` 이하의 JPEG Blob으로 만든다. 이미 작으면 크기는 그대로 두고 인코딩만 한다.
 * 캔버스를 못 만들거나 인코딩에 실패하면 한국어 Error를 던진다.
 */
export async function bitmapToJpeg(bitmap: ImageBitmap, maxEdge: number, quality: number): Promise<Blob> {
  const size = fitLongEdge(bitmap.width, bitmap.height, maxEdge)
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('캔버스를 만들지 못했습니다.')
  ctx.drawImage(bitmap, 0, 0, size.width, size.height)
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('사진을 JPEG로 바꾸지 못했습니다.'))), 'image/jpeg', quality)
  })
}

/**
 * 사진 파일을 EXIF 방향을 적용해 연다. 탐지·자르기·저장이 모두 이 방향의 좌표계를 쓴다.
 * 브라우저가 못 여는 형식(RAW, 일부 HEIC)이면 한국어 Error.
 */
export async function openOriented(file: Blob): Promise<ImageBitmap> {
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }) } catch {
    throw new Error('이 사진 형식은 열 수 없습니다. JPEG로 내보낸 사진을 골라 주세요.')
  }
}

/** Blob을 data URL로 (LLM에 그림을 보낼 때 쓴다) */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('사진을 읽지 못했습니다.'))
    reader.readAsDataURL(blob)
  })
}
