import Icon from '../ui/Icon'
import Sheet from '../ui/Sheet'

interface Props {
  onClose: () => void
  onPhoto: () => void
  onSound: () => void
}

/**
 * "+"를 누르면 뜨는 선택. 기록의 재료는 사진 아니면 소리 둘뿐이다.
 * 새소리를 별도 탭으로 두지 않고 여기 둔 이유: 탭으로 가도, 여기서 골라도 두 번 누르면 녹음이 시작된다.
 */
export default function AddSheet({ onClose, onPhoto, onSound }: Props) {
  return (
    <Sheet title="무엇으로 기록할까요?" onClose={onClose}>
      <div className="choice-grid">
        <button type="button" className="choice" onClick={onPhoto}>
          <Icon name="camera" size={30} />
          <strong>사진으로</strong>
          <span>새를 찾아 자르고 이름을 알아봅니다</span>
        </button>
        <button type="button" className="choice" onClick={onSound}>
          <Icon name="mic" size={30} />
          <strong>소리로</strong>
          <span>녹음해서 어떤 새인지 알아봅니다</span>
        </button>
      </div>
    </Sheet>
  )
}
