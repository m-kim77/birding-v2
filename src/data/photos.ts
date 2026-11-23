import type { PhotoKind, Sighting } from '../types'
// 확장자를 적는 이유: node --test가 이 파일을 직접 읽는다 (가짜 IndexedDB로 트랜잭션 안의 읽고 쓰기를 시험한다)
import { dbCount, dbGet, dbPut, dbWriteAll } from './db.ts'
import { normalizeStored } from './normalizeSighting.ts'
// 키 모양은 점검·정리(photoCheck.ts)와 함께 쓴다 — 여기서 따로 만들면 둘이 어긋날 수 있다
import { PHOTO_KINDS as KINDS, photoKey as key } from './photoKey.ts'
import { queueDeleteIn } from './syncQueue.ts'

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
 * 바깥에서 온 기록(백업 불러오기·드라이브에서 받기)을 그 사진과 함께 트랜잭션 하나로 쓴다 — 단, 같은 트랜잭션 안에서 기기의 기록을 다시 읽어
 * 기기 쪽이 같거나 더 새 판이면 기록도 사진도 쓰지 않는다. 어느 판을 쓸지는 그 전에 읽은 기기 기록으로 정했으니,
 * 그사이 동기화가 받아 쓴 더 새 판이나 사용자의 고침을 옛 판으로 덮으면 안 된다 (늦은 쪽이 이긴다 — backupFormat.ts planMerge와 같은 규칙).
 * 썼으면 true, 기기 판을 그대로 두었으면 false. 실패하면 한국어 Error로 거절된다 (용량 부족 포함).
 */
export async function writeSightingIfNewer(s: Sighting, photos: PhotoFile[]): Promise<boolean> {
  let wrote = false
  await dbWriteAll(['sightings', 'photos'], (store) => {
    const req = store('sightings').get(s.id)
    // 같은 트랜잭션 안에서 읽은 뒤 쓴다 (요청 콜백 안의 요청은 트랜잭션을 이어 간다)
    req.onsuccess = () => {
      const cur = req.result as Sighting | undefined
      if (cur && cur.updatedAt >= s.updatedAt) return
      store('sightings').put(s)
      for (const p of photos) store('photos').put(p.blob, key(s.id, p.kind))
      wrote = true
    }
  })
  return wrote
}

/**
 * 기록의 몇 칸을 고친다 — 같은 트랜잭션 안에서 DB의 기록을 읽어 그 위에 고친 칸과 새 updatedAt(`now`)만 얹어 쓴다.
 * 화면이 들고 있던 판 위에 얹으면, 그사이 동기화가 받아 쓴 더 새 판(다른 기기의 고침)이 사라지고 그 결과가 '가장 새 판'으로 드라이브에 퍼진다.
 * 읽은 기록은 빈 칸을 채워(normalizeStored) 쓴다 — 화면이 보던 모양과 같게. 사진은 건드리지 않는다.
 * 고친 기록을 돌려준다. 기록이 없으면(그새 지워졌다) 아무것도 쓰지 않고 null. DB 실패는 던진다.
 */
export async function patchSighting(id: string, patch: Partial<Sighting>, now: Date): Promise<Sighting | null> {
  let next: Sighting | null = null
  await dbWriteAll(['sightings'], (store) => {
    const req = store('sightings').get(id)
    // 같은 트랜잭션 안에서 읽은 뒤 쓴다 (요청 콜백 안의 요청은 트랜잭션을 이어 간다)
    req.onsuccess = () => {
      const cur = normalizeStored(req.result)
      if (!cur) return
      next = { ...cur, ...patch, updatedAt: now.toISOString() }
      store('sightings').put(next)
    }
  })
  return next
}

/**
 * 기록과 딸린 사진 세 판을 트랜잭션 하나로 지운다. 없는 판이 있어도 성공한다.
 * 이 기기가 드라이브와 한 번이라도 연결했으면(지금 끊겨 있어도) 드라이브에서도 지우라는 일을 **같은 트랜잭션에** 줄에 넣는다 (syncQueue.ts queueDeleteIn) —
 * 따로 넣다가 그 사이 탭이 닫히거나, 끊긴 동안이라 빼먹으면 다음 동기화가 드라이브의 기록을 도로 받아 지운 기록이 되살아난다.
 * `now`는 지운 시각 (드라이브의 지움 표시에 적힌다).
 */
export function deleteSightingWithPhotos(id: string, now: Date): Promise<void> {
  return dbWriteAll(['sightings', 'photos', 'syncQueue', 'meta'], (store) => {
    store('sightings').delete(id)
    for (const kind of KINDS) store('photos').delete(key(id, kind))
    queueDeleteIn(store, id, now)
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
