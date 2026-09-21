import { useState, type ReactNode } from 'react'
import Icon from './Icon'

interface Props {
  src: string
  alt: string
  /** 가로/세로 비. 망원 사진의 기본은 3:2 */
  ratio?: string
  /** 사진 위에 겹쳐 그릴 것 (탐지 상자 등) */
  children?: ReactNode
  /** 소리로 만든 기록은 새 대신 소리 아이콘을 자리 표시로 쓴다 */
  sound?: boolean
}

/**
 * 사진 상자. 주소가 비었거나 불러오기에 실패하면 자리 표시를 그린다.
 * 어떤 테마에서도 사진에 색을 입히지 않는다 — 새의 색이 곧 정보다.
 */
export default function PhotoBox({ src, alt, ratio = '3 / 2', children, sound }: Props) {
  const [failed, setFailed] = useState(false)
  const showImage = src && !failed
  return (
    <div className="photo-box" style={{ aspectRatio: ratio }}>
      {showImage
        ? // crossOrigin: 같은 사진을 나중에 캔버스(카드 내보내기)가 다시 읽는다. 여기서 CORS 없이 받아 캐시에 넣으면 그때 실패한다
        <img src={src} alt={alt} loading="lazy" crossOrigin="anonymous" onError={() => setFailed(true)} />
        : <div className="photo-empty" role="img" aria-label={alt}><Icon name={sound ? 'wave' : 'bird'} size={36} /></div>}
      {children}
    </div>
  )
}
