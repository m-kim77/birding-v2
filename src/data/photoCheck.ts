/**
 * 사진 점검: 사진이 빠진 기록과 기록이 없는 사진(주인 없는 사진)을 찾고, 뒤의 것을 지운다. 설정의 저장 공간 카드가 쓴다.
 *
 * 생긴 길 — 작업 7(2026-09-26) 전에는 기록 한 건을 트랜잭션 넷으로 썼다(큰 판·잘라낸 판·작은 판 → 기록). 중간에 끊기면 사진만 남았고,
 * 지우기가 반쯤 되면 기록만 지워지고 사진이 남았다. 사진이 빠진 기록은 확정 전의 "성공"(작업 7 전), 기록을 먼저 다 쓰던 옛 복원이
 * 끊긴 것(작업 8 전), 사진이 빠진 백업 파일에서 생긴다. 지금 앱은 둘 다 만들지 않는다 — 이미 쌓인 것을 찾는 도구다.
 *
 * 사진은 키만 읽는다(`getAllKeys`) — Blob을 꺼내지 않으므로 사진이 수천 장이어도 가볍다.
 * checkPhotos·findOrphanKeys는 순수 함수다 (node --test로 검사한다). DB 함수는 부를 때만 브라우저 DB를 연다.
 */
import type { PhotoKind } from '../types'
// 확장자를 적는 이유: node --test가 이 파일을 직접 읽는다 (Vite는 어느 쪽이든 된다)
import { dbReadAll, dbWriteAll } from './db.ts'
// 확장자를 적는 이유: 위와 같다
import { photoKey, photoOwner } from './photoKey.ts'

/** 화면이 기대는 판: 목록은 작은 판, 상세는 큰 판. 잘라낸 판은 없어도 두 판이 대신하므로 보지 않는다 */
const NEEDED: PhotoKind[] = ['full', 'thumb']

/** 점검에 쓰는 기록의 부분 */
export interface PhotoOwner {
  id: string
  /** 소리로 만든 기록은 사진이 없는 것이 정상이다 */
  fromSound: boolean
}

/** 사진이 빠진 기록 한 건 */
export interface MissingPhotos {
  id: string
  /** 없는 판 — 'full'·'thumb' 가운데 */
  kinds: PhotoKind[]
}

export interface PhotoCheck {
  /** 큰 판이나 작은 판이 없는 기록 (읽은 순서 그대로) */
  missing: MissingPhotos[]
  /** 기록이 없는 사진의 키 전부 */
  orphanKeys: string[]
  /** 그 사진들이 딸려 있던 (지금은 없는) 기록 수. 화면은 판 수가 아니라 이것으로 센다 — 한 장이 판 셋이라 판 수로 세면 부풀어 보인다 */
  orphanRecords: number
}

/**
 * 기록이 없는 사진의 키를 고른다. 그 id의 기록이 없으면 판 이름과 상관없이 고른다 (모르는 판이라도 기록이 없으면 읽을 곳이 없다).
 * 기록이 있는 사진은 모르는 판이어도 건드리지 않는다 — 새 판의 앱이 더한 판일 수 있다.
 */
export function findOrphanKeys(sightingIds: Iterable<string>, photoKeys: string[]): string[] {
  const ids = new Set(sightingIds)
  return photoKeys.filter((k) => !ids.has(photoOwner(k)))
}

/**
 * 사진을 점검한다. 소리 기록은 사진이 없어도 빠진 것으로 치지 않는다.
 * 앞으로 "사진 없는 빠른 기록"이 생기면 그것도 여기서 빼야 한다 — 안 빼면 전부 "사진이 빠진 기록"으로 보인다.
 */
export function checkPhotos(sightings: PhotoOwner[], photoKeys: string[]): PhotoCheck {
  const have = new Set(photoKeys)
  const missing: MissingPhotos[] = []
  for (const s of sightings) {
    if (s.fromSound) continue
    const kinds = NEEDED.filter((kind) => !have.has(photoKey(s.id, kind)))
    if (kinds.length) missing.push({ id: s.id, kinds })
  }
  const orphanKeys = findOrphanKeys(sightings.map((s) => s.id), photoKeys)
  return { missing, orphanKeys, orphanRecords: new Set(orphanKeys.map(photoOwner)).size }
}

/** DB에서 읽은 기록을 점검에 쓰는 모양으로. 모양을 믿지 않는다 — id는 저장소의 키라 늘 있지만, 사진 키와 견주려고 글자로 맞춘다 */
function ownerOf(raw: unknown): PhotoOwner {
  const r = raw as { id?: unknown; fromSound?: unknown }
  return { id: String(r.id), fromSound: r.fromSound === true }
}

/**
 * 기록과 사진 키를 읽기 트랜잭션 하나로 읽어 점검한다 — 따로 읽으면 그 사이 저장된 기록의 사진이 "기록이 없는 사진"으로 잘못 셈해진다.
 * DB를 못 열면 던진다 (부르는 쪽이 안내한다).
 */
export function readPhotoCheck(): Promise<PhotoCheck> {
  return dbReadAll(['sightings', 'photos'], (store) => {
    const sightings = store('sightings').getAll()
    const keys = store('photos').getAllKeys()
    return () => checkPhotos(sightings.result.map(ownerOf), keys.result.map(String))
  })
}

/**
 * 기록이 없는 사진을 지우고, 그 사진들이 딸려 있던 기록 수를 돌려준다 (지울 것이 없으면 0).
 * **지우는 트랜잭션 안에서 다시 센다** — 화면이 들고 있던 목록으로 지우면, 그사이 백업 불러오기로 되살아난 기록의 사진까지 지울 수 있다.
 * 키를 읽은 요청의 success 안에서 지우기 요청을 만든다 (그 순간 트랜잭션은 살아 있다 — await를 끼우면 끝나 버린다).
 * 실패하면 아무것도 지워지지 않고 거절된다.
 */
export async function deleteOrphanPhotos(): Promise<number> {
  let removed = 0
  await dbWriteAll(['sightings', 'photos'], (store) => {
    const ids = store('sightings').getAllKeys()
    const keys = store('photos').getAllKeys()
    // 한 트랜잭션의 요청은 만든 순서대로 끝난다 — keys가 끝났으면 ids도 끝나 있다
    keys.onsuccess = () => {
      const orphans = new Set(findOrphanKeys(ids.result.map(String), keys.result.map(String)))
      // 지울 때는 읽은 키 값 그대로 — 글자로 바꾼 값으로 지우면 글자가 아닌 키(앱은 만들지 않는다)는 안 지워진다
      for (const k of keys.result) if (orphans.has(String(k))) store('photos').delete(k)
      removed = new Set([...orphans].map(photoOwner)).size
    }
  })
  return removed
}
