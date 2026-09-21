import Button from '../../ui/Button'
import Icon from '../../ui/Icon'
import Sheet from '../../ui/Sheet'

interface Props {
  place: string
  onClose: () => void
  onPick: (place: string, note: string) => void
}

/**
 * 위치 고치기. 위치는 사진 정보 → 이동 기록 → 현재 위치 순으로 자동으로 정해지므로,
 * 이 시트는 자동으로 정한 위치가 틀렸을 때만 연다.
 *
 * v1은 기록 화면에 위치 버튼 세 개(이동 기록에서 찾기·현재 위치·직전 기록 복사)와 추정 위치 "확인" 버튼을
 * 늘 꺼내 두었다. 여기서는 추정 위치를 일단 받아들이고, 고칠 때 쓰는 수단만 이 안에 모았다.
 */
export default function LocationSheet({ place, onClose, onPick }: Props) {
  return (
    <Sheet title="위치 고치기" onClose={onClose}>
      <div className="map-mock map-pick" role="img" aria-label="지도 — 눌러서 위치를 고릅니다">
        <span className="map-pin is-picked" style={{ left: '52%', top: '46%' }}><Icon name="pin" size={28} /></span>
      </div>
      <p className="hint">지도를 눌러 위치를 옮기세요. 지금: {place}</p>
      <div className="sheet-actions">
        {/* 현재 위치로: 카메라 사진에는 위치가 없는 경우가 많고, 현장에서 바로 기록할 때는 지금 서 있는 곳이 답이다 */}
        <Button icon="pin" onClick={() => onPick('현재 위치 (서울숲 부근)', '기록할 때의 현재 위치')}>현재 위치로</Button>
        {/* 직전 기록 위치로: 한자리에서 여러 장을 연달아 기록할 때 같은 위치를 다시 찍지 않게 한다 */}
        <Button icon="clock" onClick={() => onPick('중랑천 하류', '직전 기록과 같은 위치')}>직전 기록 위치로</Button>
      </div>
    </Sheet>
  )
}
