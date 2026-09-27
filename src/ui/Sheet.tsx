import { useEffect, type ReactNode } from 'react'
import { useBackLayer } from '../app/useNav'
import Icon from './Icon'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
}

/**
 * 아래에서 올라오는 시트(폰) / 가운데 뜨는 창(PC). 앱 영역 안에 갇혀 있어 폰 프레임 밖으로 나가지 않는다.
 * 바깥을 눌러도 닫힌다. 닫기 버튼은 남긴다 — 바깥을 누르면 닫힌다는 걸 모르는 사용자가 갇히지 않게.
 * 폰의 뒤로가기도 화면을 떠나기 전에 시트부터 닫는다 (열려 있는 동안 방문 기록에 칸이 하나 있다 — app/useNav.ts). 시트를 쓰는 화면은 따로 할 일이 없다.
 */
export default function Sheet({ title, onClose, children }: Props) {
  useBackLayer(true, onClose)
  // 키보드 사용자가 빠져나올 길. 마우스 사용자에게는 바깥 누르기와 닫기 버튼이 있다
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="sheet-scrim" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header className="sheet-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" aria-label="닫기" onClick={onClose}><Icon name="close" /></button>
        </header>
        {children}
      </div>
    </div>
  )
}
