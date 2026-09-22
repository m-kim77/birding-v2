import type { PhotoKind } from '../types'
import { dbCount, dbDelete, dbGet, dbPut } from './db'

const key = (id: string, kind: PhotoKind) => `${id}:${kind}`
const KINDS: PhotoKind[] = ['full', 'thumb', 'crop']

/** 사진 한 판을 저장한다 */
export function putPhoto(id: string, kind: PhotoKind, blob: Blob): Promise<void> {
  return dbPut('photos', blob, key(id, kind))
}

/** 사진 한 판이 저장돼 있는지. 내용은 읽지 않는다 (복원 때 수백 장을 물어보므로 Blob을 꺼내지 않는다) */
export async function hasPhoto(id: string, kind: PhotoKind): Promise<boolean> {
  return (await dbCount('photos', key(id, kind))) > 0
}

/** 사진 한 판을 읽는다. 없으면 undefined */
export function getPhoto(id: string, kind: PhotoKind): Promise<Blob | undefined> {
  return dbGet<Blob>('photos', key(id, kind))
}

/**
 * 카드·목록에 쓸 사진을 고른다: 잘라낸 판이 있으면 그것, 없으면 주어진 판.
 * 새가 작게 찍힌 망원 사진에서는 잘라낸 판이 곧 "그 새의 사진"이다.
 */
export async function getBestPhoto(id: string, fallback: PhotoKind): Promise<Blob | undefined> {
  return (await getPhoto(id, 'crop')) ?? getPhoto(id, fallback)
}

/** 기록에 딸린 사진을 모두 지운다 */
export async function deletePhotos(id: string): Promise<void> {
  await Promise.all(KINDS.map((kind) => dbDelete('photos', key(id, kind))))
}

/** 기록에 딸린 사진을 있는 것만 모은다 (백업용) */
export async function allPhotosOf(id: string): Promise<Array<{ kind: PhotoKind; blob: Blob }>> {
  const found = await Promise.all(KINDS.map(async (kind) => ({ kind, blob: await getPhoto(id, kind) })))
  return found.filter((p): p is { kind: PhotoKind; blob: Blob } => p.blob !== undefined)
}
