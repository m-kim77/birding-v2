import { putPhoto } from '../../data/photos'
import { cropFromFile, dataUrlToBlob } from '../../lib/crop'
import { FULL_MAX_EDGE, THUMB_MAX_EDGE, bitmapToJpeg, blobToDataUrl } from '../../lib/resize'
import { IDENTIFY_MAX_EDGE } from '../identify/loop'
import type { NormalizedBox } from '../../types'
import type { PickedPhoto } from './usePhotoPick'

/**
 * 고른 영역을 원본 해상도에서 잘라 낸다. LLM에 보낼 그림과 저장할 그림이 같은 것이어야 해서 한 곳에서 만든다.
 * 실패하면(방향 해석 불일치 등) null — 자르기가 안 돼도 기록 저장은 막지 않는다 (v1과 같은 원칙).
 */
export async function makeCrop(photo: PickedPhoto, box: NormalizedBox): Promise<{ blob: Blob; box: NormalizedBox; dataUrl: string } | null> {
  try {
    const out = await cropFromFile(photo.file, box, photo.size)
    return { blob: dataUrlToBlob(out.dataUrl), box: out.box, dataUrl: out.dataUrl }
  } catch {
    return null
  }
}

/**
 * AI에 보낼 그림을 만든다: 자른 영역이 있으면 그 부분, 없으면 **사진 전체**.
 * 어느 쪽이든 캔버스에서 1024px로 줄여 다시 인코딩한다 — 그림 토큰을 아끼고, 원본의 EXIF(위치)가 따라가지 않게 한다.
 * 자르기에 실패하면(makeCrop이 null) 사진 전체로 떨어진다.
 */
export async function imageForAI(photo: PickedPhoto, box: NormalizedBox | null): Promise<string> {
  const cut = box ? await makeCrop(photo, box) : null
  if (!cut) return blobToDataUrl(await bitmapToJpeg(photo.bitmap, IDENTIFY_MAX_EDGE, 0.88))
  const bitmap = await createImageBitmap(cut.blob)
  try { return await blobToDataUrl(await bitmapToJpeg(bitmap, IDENTIFY_MAX_EDGE, 0.88)) } finally { bitmap.close() }
}

/**
 * 기록의 사진을 로컬 DB에 넣는다: 큰 판(긴 변 2048), 잘라낸 판(있으면), 작은 판.
 * **작은 판은 잘라낸 사진에서 만든다** — 목록과 도감에서 보고 싶은 것은 풍경이 아니라 그 새다.
 * 원본 파일은 보관하지 않는다 (수십 MB짜리 수백 장이면 브라우저 저장소가 찬다. 원본은 사용자의 카메라·PC에 있다).
 */
export async function savePhotos(id: string, photo: PickedPhoto, crop: Blob | null): Promise<void> {
  await putPhoto(id, 'full', await bitmapToJpeg(photo.bitmap, FULL_MAX_EDGE, 0.88))
  if (crop) await putPhoto(id, 'crop', crop)
  const thumbSource = crop ? await createImageBitmap(crop) : photo.bitmap
  try {
    await putPhoto(id, 'thumb', await bitmapToJpeg(thumbSource, THUMB_MAX_EDGE, 0.82))
  } finally {
    if (crop) thumbSource.close()
  }
}
