import { useLayoutEffect, useState } from 'react'
import type { PhotoKind } from '../types'
import { getBestPhoto, getPhoto } from './photos'
import { createUrlCache } from './photoUrlCache'

/**
 * 작은 판(썸네일)의 주소를 이만큼 남겨 둔다 — 쓰는 화면이 없는 것만 센다 (photoUrlCache.ts).
 * 작은 판은 긴 변 480px JPEG(수십 KB)라 300장이어도 10MB 안팎이다. 큰 판(2048px)은 남기지 않는다 — 한 장이 수백 KB다.
 */
const THUMB_URLS_KEPT = 300
const thumbUrls = createUrlCache(THUMB_URLS_KEPT, (url) => URL.revokeObjectURL(url))

/** 보관함의 키 — 작은 판만 남긴다(나머지는 null). preferCrop이면 읽는 판이 달라지므로 키도 다르다 */
function thumbKey(id: string, kind: PhotoKind, preferCrop: boolean): string | null {
  return kind === 'thumb' ? `${id}:${kind}:${preferCrop ? 'best' : 'only'}` : null
}

/**
 * 기록의 사진을 `<img src>`에 넣을 수 있는 주소로 바꾼다. 읽는 동안과 사진이 없을 때는 빈 문자열.
 * `preferCrop`이면 잘라낸 판을 먼저 찾는다 (목록·카드용). `wanted`가 거짓이면 DB를 읽지 않고 기다린다 (화면에서 먼 목록 칸 — SightingPhoto lazy).
 * 작은 판의 주소는 보관함에서 빌려 쓰고 화면에서 빠질 때 돌려준다 — 일지에 돌아오면 다시 읽지 않고, 보관함에 남아 있으면 `wanted`와 상관없이 곧바로 쓴다
 * (DB를 읽지 않으니 미룰 까닭이 없고, 미루면 돌아올 때 사진 자리가 한 번 비어 보인다).
 * 그 밖의 판은 만든 주소를 화면에서 빠질 때 해제한다 — 안 하면 Blob이 메모리에 계속 남는다. 못 읽으면 빈 문자열 그대로다 (자리 표시).
 */
export function usePhotoUrl(id: string, kind: PhotoKind, preferCrop = false, wanted = true): string {
  const [url, setUrl] = useState('')
  const key = thumbKey(id, kind, preferCrop)
  // 그릴 때 보관함에 있는지만 본다(빌리지 않는다) — 있으면 처음부터 읽을 때가 된 것으로 친다. 주소는 아래에서 빌린 것만 쓴다
  const [cachedAtStart] = useState(() => key !== null && thumbUrls.has(key))
  const go = wanted || cachedAtStart
  // 그리기 전에 빌린다 — 보관함에 있던 주소면 사진 자리가 비었다가 채워지는 한 번이 화면에 보이지 않는다
  useLayoutEffect(() => {
    let alive = true
    let borrowed = false
    let made = ''
    const hit = key ? thumbUrls.take(key) : null
    if (hit) {
      borrowed = true
      setUrl(hit)
    } else {
      setUrl('')
      if (go) {
        void (preferCrop ? getBestPhoto(id, kind) : getPhoto(id, kind)).then((blob) => {
          if (!alive || !blob) return
          const fresh = URL.createObjectURL(blob)
          if (key) { borrowed = true; setUrl(thumbUrls.put(key, fresh)) } else { made = fresh; setUrl(fresh) }
        }).catch(() => { /* 사진을 못 읽어도 기록은 보여야 한다 — 자리 표시가 대신한다 */ })
      }
    }
    return () => {
      alive = false
      if (borrowed && key) thumbUrls.release(key)
      if (made) URL.revokeObjectURL(made)
    }
  }, [id, kind, preferCrop, key, go])
  return url
}
