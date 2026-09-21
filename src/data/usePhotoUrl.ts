import { useEffect, useState } from 'react'
import type { PhotoKind } from '../types'
import { getBestPhoto, getPhoto } from './photos'

/**
 * 기록의 사진을 `<img src>`에 넣을 수 있는 주소로 바꾼다. 읽는 동안과 사진이 없을 때는 빈 문자열.
 * `preferCrop`이면 잘라낸 판을 먼저 찾는다 (목록·카드용).
 * 만든 주소는 화면에서 빠질 때 해제한다 — 안 하면 Blob이 메모리에 계속 남는다.
 */
export function usePhotoUrl(id: string, kind: PhotoKind, preferCrop = false): string {
  const [url, setUrl] = useState('')
  useEffect(() => {
    let alive = true
    let made = ''
    void (preferCrop ? getBestPhoto(id, kind) : getPhoto(id, kind)).then((blob) => {
      if (!alive || !blob) return
      made = URL.createObjectURL(blob)
      setUrl(made)
    }).catch(() => { /* 사진을 못 읽어도 기록은 보여야 한다 — 자리 표시가 대신한다 */ })
    return () => { alive = false; if (made) URL.revokeObjectURL(made) }
  }, [id, kind, preferCrop])
  return url
}
