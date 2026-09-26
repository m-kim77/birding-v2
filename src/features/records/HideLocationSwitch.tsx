import { useState } from 'react'
import { useJournal } from '../../data/journal'
import type { Sighting } from '../../types'
import './hideLocation.css'

/**
 * 기록 하나의 "카드·지도에서 위치 숨기기" 스위치 (`Sighting.sensitive`). 누르면 바로 저장된다 — 적용 버튼이 없다 (카드 색 고르개와 같다).
 * 켜면 카드(화면·이미지·영상)에 장소 대신 "위치 비공개"를 적고(BirdCard · cardCanvas), 지도에 핀을 올리지 않는다(MapScreen).
 * 기록 상세·목록·백업에는 장소가 그대로 남는다 — 가리는 것은 남에게 보여 주기 쉬운 두 곳뿐이다.
 *
 * 카드가 크게 보이고 밖으로 내보내는 두 곳(저장 직후 `CardResult` · 기록 상세의 카드 보기)에서 카드 아래, 저장 버튼 위에 붙는다.
 * 도감의 종 시트에는 두지 않는다 — 거기 색 고르개는 그 종의 모든 기록에 걸리는데 이 스위치는 기록 하나에만 걸려 헷갈린다.
 * 위치가 없는 기록은 가릴 것이 없어 아무것도 그리지 않는다. 저장이 실패하면 스위치는 저장된 값 그대로 두고 이유를 적는다.
 */
export default function HideLocationSwitch({ sighting }: { sighting: Sighting }) {
  const { update } = useJournal()
  const [error, setError] = useState('')
  if (!sighting.place && sighting.lat === null) return null

  /** 켜고 끈다. 화면의 값은 저장이 끝난 뒤 저장소에서 온다 — 실패하면 그대로다 */
  function toggle(on: boolean) {
    setError('')
    update(sighting.id, { sensitive: on }).catch((e: unknown) => setError(e instanceof Error ? e.message : '저장하지 못했습니다.'))
  }

  return (
    <div className="hide-location">
      <label>
        <input type="checkbox" checked={sighting.sensitive} onChange={(e) => toggle(e.target.checked)} />
        <span>
          <strong>카드·지도에서 위치 숨기기</strong>
          <small>켜면 카드(이미지·영상 포함)에 장소 대신 '위치 비공개'를 적고, 지도에 올리지 않습니다. 둥지처럼 알려지면 안 되는 곳에 씁니다.</small>
        </span>
      </label>
      {error && <p className="status-line is-warn" role="alert">{error}</p>}
    </div>
  )
}
