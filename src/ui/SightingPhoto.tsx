import { useRef } from 'react'
import { usePhotoUrl } from '../data/usePhotoUrl'
import type { PhotoKind } from '../types'
import PhotoBox from './PhotoBox'
import { useNearViewport } from './useNearViewport'

interface Props {
  id: string
  kind: PhotoKind
  alt: string
  ratio?: string
  sound?: boolean
  /** 잘라낸 판이 있으면 그것을 보여 준다 (카드·상세) */
  preferCrop?: boolean
  /**
   * 화면 가까이 올 때 읽는다 (일지 목록). 기록 수백 건을 한꺼번에 그려도 DB 읽기는 보이는 칸부터 나가고,
   * 아래로 내려 둔 자리로 돌아와도 그 앞의 칸을 다 읽을 때까지 기다리지 않는다.
   */
  lazy?: boolean
}

/** 기록의 사진을 로컬 DB에서 읽어 보여 준다. 읽는 동안과 사진이 없을 때는 PhotoBox의 자리 표시가 나온다 */
export default function SightingPhoto({ id, kind, alt, ratio, sound, preferCrop, lazy = false }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const near = useNearViewport(box, lazy)
  const url = usePhotoUrl(id, kind, preferCrop, near)
  return <PhotoBox src={url} alt={alt} ratio={ratio} sound={sound} lazy={lazy} boxRef={box} />
}
