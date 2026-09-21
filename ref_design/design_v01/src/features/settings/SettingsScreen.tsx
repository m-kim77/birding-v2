import { useState } from 'react'
import { useStore } from '../../app/store'
import { MODELS } from '../../mock/data'
import { Card, ScreenHead } from '../../ui/bits'
import Button from '../../ui/Button'
import ThemePicker from './ThemePicker'
import './settings.css'

interface Props {
  choice: string
  onChoose: (id: string) => void
}

/**
 * 설정. 자주 쓰는 순서대로 위에서 아래로: 백업 → 테마 → AI 연결 → 위치 자료 → 받은 모델 → 출처.
 * 백업이 맨 위인 이유: 기록이 이 기기에만 있어서, 이 앱에서 잃으면 안 되는 단 하나의 기능이다.
 */
export default function SettingsScreen({ choice, onChoose }: Props) {
  const { sightings, unsaved, markBackedUp, scenario } = useStore()
  const [useOwnKey, setUseOwnKey] = useState(false)

  return (
    <div className="screen screen-settings">
      <ScreenHead title="설정" />

      <Card>
        <h2>백업</h2>
        <p className="hint">기록과 사진은 이 기기에만 저장됩니다. 파일로 내려받아 두면 다른 기기에서 이어 쓸 수 있습니다.</p>
        <p className={unsaved ? 'status-line is-warn' : 'status-line is-ok'}>
          {unsaved ? `백업 안 된 기록 ${unsaved}건` : '모든 기록이 백업돼 있습니다'} · 전체 {sightings.length}건
        </p>
        <div className="row-actions">
          <Button variant={unsaved ? 'primary' : 'secondary'} icon="download" onClick={markBackedUp}>백업 파일 내려받기</Button>
          <Button icon="upload">백업 파일 불러오기</Button>
        </div>
      </Card>

      <Card>
        <h2>화면 테마</h2>
        <ThemePicker choice={choice} onChoose={onChoose} />
      </Card>

      <Card>
        <h2>AI 종 판정</h2>
        <div className="radio-rows" role="radiogroup" aria-label="AI 연결 방식">
          <label><input type="radio" name="ai" checked={!useOwnKey} onChange={() => setUseOwnKey(false)} />
            <span><strong>기본 제공 AI</strong><small>무료. 여럿이 함께 쓰므로 기다릴 수 있고, 쉬는 시간이 있습니다.</small></span></label>
          <label><input type="radio" name="ai" checked={useOwnKey} onChange={() => setUseOwnKey(true)} />
            <span><strong>내 API 키 사용</strong><small>OpenAI 호환 서비스. 요금은 그 서비스에 직접 냅니다.</small></span></label>
        </div>
        {useOwnKey && (
          <div className="key-form">
            <label className="field"><span>서비스 주소</span><input placeholder="https://api.openai.com/v1" /></label>
            <label className="field"><span>API 키</span><input type="password" placeholder="sk-…" autoComplete="off" /></label>
            <p className="hint">키는 이 기기에만 저장되고 서버에 남지 않습니다.</p>
            {/* 연결 확인: 몇 분 걸리는 판정이 끝에 가서 "키가 틀렸습니다"로 실패하지 않게, 미리 확인한다 */}
            <Button icon="check">연결 확인</Button>
          </div>
        )}
      </Card>

      <Card>
        <h2>위치 자료</h2>
        <p className="hint">카메라 사진에는 위치가 없는 경우가 많습니다. 구글 타임라인 파일을 넣어 두면 촬영 시각으로 위치를 찾아 줍니다.</p>
        <p className="status-line">2026. 08. 01. ~ 2026. 09. 21. 구간이 들어 있습니다</p>
        <Button icon="upload">타임라인 파일 넣기</Button>
      </Card>

      <Card>
        <h2>받은 모델</h2>
        <ul className="model-list">
          {MODELS.map((m) => {
            const have = scenario !== 'no-model'
            return (
              <li key={m.id}>
                <div><strong>{m.name}</strong><small>{m.purpose} · {m.sizeMb}MB</small></div>
                {/* 지우기: 폰 저장 공간을 돌려받는 수단. 받기: 와이파이에 있을 때 미리 받아 두는 수단 */}
                <Button variant="quiet" icon={have ? 'trash' : 'download'}>{have ? '지우기' : '받기'}</Button>
              </li>
            )
          })}
        </ul>
      </Card>

      <button type="button" className="link-row">오픈소스 · 모델 출처</button>
    </div>
  )
}
