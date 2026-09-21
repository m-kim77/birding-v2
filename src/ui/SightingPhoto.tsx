import { usePhotoUrl } from '../data/usePhotoUrl'
import type { PhotoKind } from '../types'
import PhotoBox from './PhotoBox'

interface Props {
  id: string
  kind: PhotoKind
  alt: string
  ratio?: string
  sound?: boolean
  /** 잘라낸 판이 있으면 그것을 보여 준다 (카드·상세) */
  preferCrop?: boolean
}

/** 기록의 사진을 로컬 DB에서 읽어 보여 준다. 읽는 동안과 사진이 없을 때는 PhotoBox의 자리 표시가 나온다 */
export default function SightingPhoto({ id, kind, alt, ratio, sound, preferCrop }: Props) {
  const url = usePhotoUrl(id, kind, preferCrop)
  return <PhotoBox src={url} alt={alt} ratio={ratio} sound={sound} />
}
