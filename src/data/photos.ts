import type { PhotoKind, Sighting } from '../types'
import { dbCount, dbGet, dbPut, dbWriteAll } from './db'
// 키 모양은 점검·정리(photoCheck.ts)와 함께 쓴다 — 여기서 따로 만들면 둘이 어긋날 수 있다
import { PHOTO_KINDS as KINDS, photoKey as key } from './photoKey'
import type { QueueEntry } from './syncPlan'

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

/**
 * 기록과 딸린 사진 세 판을 트랜잭션 하나로 지운다. 없는 판이 있어도 성공한다.
 * `syncEntry`가 있으면(드라이브를 연결했을 때) 드라이브에서도 지우라는 일을 **같은 트랜잭션에** 줄에 넣는다 —
 * 따로 넣다가 그 사이 탭이 닫히면 다음 동기화가 드라이브의 기록을 도로 받아 지운 기록이 되살아난다.
 */
export function deleteSightingWithPhotos(id: string, syncEntry?: QueueEntry): Promise<void> {
  return dbWriteAll(syncEntry ? ['sightings', 'photos', 'syncQueue'] : ['sightings', 'photos'], (store) => {
    store('sightings').delete(id)
    for (const kind of KINDS) store('photos').delete(key(id, kind))
    if (syncEntry) store('syncQueue').put(syncEntry, id)
  })
}

/**
 * 드라이브에서 지운 기록을 기기에서도 지운다 (sync.ts pull — planPull의 removeLocal). 기록·사진 세 판·줄의 항목을 트랜잭션 하나로 지운다.
 * 지우기 직전에 같은 트랜잭션 안에서 기록을 다시 읽어, 드라이브의 지움(`deletedAt`)보다 늦게 고쳐졌으면 지우지 않는다 —
 * 계획은 다른 기록을 받기 전에 읽은 기록으로 정했으니, 받는 사이 사용자가 고친 것까지 지우면 안 된다 (그 고침은 다음 판에 올라간다).
 * 줄의 항목도 함께 지운다 — 남겨 두면 올릴 기록이 없는 멈춘 항목이 드라이브 카드의 '못 올림'에 계속 세진다.
 * 지웠으면 true, 이미 없거나 더 늦게 고쳐졌으면 false. DB 실패는 던진다.
 */
export async function deletePulledSighting(id: string, deletedAt: string): Promise<boolean> {
  let removed = false
  await dbWriteAll(['sightings', 'photos', 'syncQueue'], (store) => {
    const req = store('sightings').get(id)
    // 같은 트랜잭션 안에서 읽은 뒤 지운다 (요청 콜백 안의 요청은 트랜잭션을 이어 간다)
    req.onsuccess = () => {
      const cur = req.result as Sighting | undefined
      if (!cur || cur.updatedAt > deletedAt) return
      store('sightings').delete(id)
      for (const kind of KINDS) store('photos').delete(key(id, kind))
      store('syncQueue').delete(id)
      removed = true
    }
  })
  return removed
}

/** 기록에 딸린 사진을 있는 것만 모은다 (백업용) */
export async function allPhotosOf(id: string): Promise<Array<{ kind: PhotoKind; blob: Blob }>> {
  const found = await Promise.all(KINDS.map(async (kind) => ({ kind, blob: await getPhoto(id, kind) })))
  return found.filter((p): p is { kind: PhotoKind; blob: Blob } => p.blob !== undefined)
}
