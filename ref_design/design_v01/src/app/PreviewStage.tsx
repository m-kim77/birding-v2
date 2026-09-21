import type { ReactNode } from 'react'
import Icon from '../ui/Icon'
import type { Scenario } from '../types'

export type Device = 'phone' | 'pc'

interface Props {
  device: Device
  onDevice: (d: Device) => void
  scenario: Scenario
  onScenario: (s: Scenario) => void
  forceDark: boolean
  onForceDark: (v: boolean) => void
  children: ReactNode
}

const SCENARIOS: Array<{ id: Scenario; label: string }> = [
  { id: 'normal', label: '정상' },
  { id: 'no-model', label: '모델을 아직 안 받음' },
  { id: 'server-down', label: '판정 서버가 쉬는 중' },
  { id: 'no-bird', label: '사진에서 새를 못 찾음' },
]

/**
 * 초안 보기 도구. **제품에는 없다.** 같은 앱을 폰 폭과 PC 폭으로 바꿔 가며 보고,
 * 평소에는 보기 어려운 상태 화면을 골라서 확인한다.
 * 실제 폰처럼 창이 좁으면 도구 막대와 프레임 없이 앱만 꽉 채운다 (styles/stage.css).
 */
export default function PreviewStage({ device, onDevice, scenario, onScenario, forceDark, onForceDark, children }: Props) {
  return (
    <div className="stage">
      <div className="stage-bar">
        <span className="stage-note">초안 보기 도구 · 제품에는 없음</span>
        <div className="seg" role="group" aria-label="화면 크기">
          <button type="button" className={device === 'phone' ? 'is-on' : ''} onClick={() => onDevice('phone')}><Icon name="phone" size={16} /> 앱(폰)</button>
          <button type="button" className={device === 'pc' ? 'is-on' : ''} onClick={() => onDevice('pc')}><Icon name="monitor" size={16} /> 웹(PC)</button>
        </div>
        <label className="stage-field">상황
          <select value={scenario} onChange={(e) => onScenario(e.target.value as Scenario)}>
            {SCENARIOS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label className="stage-check">
          <input type="checkbox" checked={forceDark} onChange={(e) => onForceDark(e.target.checked)} />
          기기가 다크 모드라고 가정
        </label>
      </div>
      <div className={`stage-body stage-${device}`}>
        <div className="viewport">{children}</div>
      </div>
    </div>
  )
}
