/**
 * 사진 저장소(`photos`)의 키 모양 `${기록id}:${판}`을 한 곳에 둔다.
 * 사진을 쓰고 읽는 곳(photos.ts)과 점검·정리(photoCheck.ts)가 같은 모양을 봐야 해서 따로 뺐다. 순수 함수다 (node --test가 직접 읽는다).
 * **이 저장소에는 기록의 사진만 둔다** — 정리가 "기록이 없는 키"를 지우므로, 다른 사진(예: 탐조 세션 표지)은 새 저장소에 둔다.
 */
import type { PhotoKind } from '../types'

/** 사진 한 장의 판 전부. 'crop'은 잘라낸 적이 있을 때만 있다 */
export const PHOTO_KINDS: PhotoKind[] = ['full', 'thumb', 'crop']

/** 기록 id와 판으로 키를 만든다 */
export function photoKey(id: string, kind: PhotoKind): string {
  return `${id}:${kind}`
}

/**
 * 키에서 기록 id를 되찾는다 — 마지막 ':'의 앞. 판 이름에는 ':'가 없으므로 id에 ':'가 들어 있어도 맞게 자른다.
 * ':'가 없는 키(앱이 만들지 않는 모양)는 키 전체를 id로 본다 — 그런 id의 기록은 없으니 "기록이 없는 사진"으로 셈해진다.
 */
export function photoOwner(key: string): string {
  const i = key.lastIndexOf(':')
  return i < 0 ? key : key.slice(0, i)
}
