import Button from '../../ui/Button'
import Sheet from '../../ui/Sheet'
import LeafletMap from '../map/LeafletMap'
import '../map/map.css'
import type { PlaceValue } from './usePlace'

interface Props {
  place: PlaceValue
  error: string
  /** 직전 기록의 위치. 없으면 그 버튼을 그리지 않는다 */
  last: PlaceValue | null
  onClose: () => void
  onPickOnMap: (lat: number, lng: number) => void
  onUseCurrent: () => void
  onCopyLast: (p: PlaceValue) => void
}

const SEOUL: [number, number] = [37.5665, 126.978]

/**
 * 위치 고치기. 위치는 사진 정보에서 자동으로 오므로, 이 시트는 위치가 없거나 틀렸을 때만 연다.
 * v1이 기록 화면에 늘 꺼내 두었던 위치 버튼들을 이 안에 모았다.
 */
export default function LocationSheet({ place, error, last, onClose, onPickOnMap, onUseCurrent, onCopyLast }: Props) {
  const has = place.lat !== null && place.lng !== null
  return (
    <Sheet title="위치 고치기" onClose={onClose}>
      <div className="map-frame-pick">
        <LeafletMap markers={has ? [{ key: 'here', lat: place.lat!, lng: place.lng!, picked: true }] : []}
          center={last?.lat != null && last.lng != null ? [last.lat, last.lng] : SEOUL} onPick={onPickOnMap} />
      </div>
      <p className="hint">지도를 눌러 위치를 옮기세요.{has && ` 지금: ${place.name || `${place.lat!.toFixed(4)}, ${place.lng!.toFixed(4)}`}`}</p>
      {error && <p className="status-line is-warn" role="alert">{error}</p>}
      <div className="sheet-actions">
        {/* 현재 위치로: 카메라 사진에는 위치가 없는 경우가 많고, 현장에서 바로 기록할 때는 지금 선 곳이 답이다 */}
        <Button icon="pin" onClick={onUseCurrent}>현재 위치로</Button>
        {/* 직전 기록 위치로: 한자리에서 여러 장을 연달아 기록할 때 같은 위치를 다시 찍지 않게 한다 */}
        {last && <Button icon="clock" onClick={() => onCopyLast(last)}>직전 기록 위치로{last.name ? ` (${last.name})` : ''}</Button>}
        <Button variant="primary" icon="check" onClick={onClose}>이 위치로</Button>
      </div>
    </Sheet>
  )
}
