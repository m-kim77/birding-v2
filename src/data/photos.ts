import type { PhotoKind, Sighting } from '../types'
import { dbCount, dbGet, dbPut, dbWriteAll } from './db'

const key = (id: string, kind: PhotoKind) => `${id}:${kind}`
const KINDS: PhotoKind[] = ['full', 'thumb', 'crop']

/** 저장할 사진 한 판. 만드는 쪽(record/savePhotos.ts)과 쓰는 쪽(여기)을 잇는다 */
export interface PhotoFile { kind: PhotoKind; blob: Blob }

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

/**
 * 기록과 그 사진들을 트랜잭션 하나로 쓴다 — 둘 다 들어가거나 둘 다 안 들어간다.
 * 따로 쓰면 중간에 끊겼을 때 목록에 없는 사진만 남거나, 사진 없는 기록이 생긴다.
 * 사진은 미리 다 만들어 와야 한다 (트랜잭션 안에서 JPEG를 만들며 기다리면 트랜잭션이 저절로 끝난다 — db.ts dbWriteAll).
 * 실패하면 한국어 Error로 거절된다 (용량 부족 포함).
 */
export function writeSightingWithPhotos(s: Sighting, photos: PhotoFile[]): Promise<void> {
  return dbWriteAll(['sightings', 'photos'], (store) => {
    store('sightings').put(s)
    for (const p of photos) store('photos').put(p.blob, key(s.id, p.kind))
  })
}

/** 기록과 딸린 사진 세 판을 트랜잭션 하나로 지운다. 없는 판이 있어도 성공한다 */
export function deleteSightingWithPhotos(id: string): Promise<void> {
  return dbWriteAll(['sightings', 'photos'], (store) => {
    store('sightings').delete(id)
    for (const kind of KINDS) store('photos').delete(key(id, kind))
  })
}

/** 기록에 딸린 사진을 있는 것만 모은다 (백업용) */
export async function allPhotosOf(id: string): Promise<Array<{ kind: PhotoKind; blob: Blob }>> {
  const found = await Promise.all(KINDS.map(async (kind) => ({ kind, blob: await getPhoto(id, kind) })))
  return found.filter((p): p is { kind: PhotoKind; blob: Blob } => p.blob !== undefined)
}
