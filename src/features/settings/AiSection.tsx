import { useState } from 'react'
import { Card } from '../../ui/bits'
import Button from '../../ui/Button'
import { checkConnection, loadStoredKey, saveOwnKey, setOwnKeyEnabled, type OwnKey } from '../identify/connection'
import TaskResult from './TaskResult'
import { useTask } from './useTask'

const EMPTY: OwnKey = { baseUrl: 'https://api.openai.com/v1', apiKey: '', model: '' }

/**
 * AI 종 판정을 누가 맡는지. 기본 제공 AI(무료, 쉬는 시간이 있다) 또는 내 API 키(요금은 그 서비스에 직접).
 * 키는 이 기기에만 저장한다. 내 키를 쓰면 사진(잘라낸 부분)이 우리 서버를 거치지 않고 그 서비스로 바로 간다.
 * 기본 제공 AI로 돌아가도 저장한 키는 지우지 않는다 — 라디오를 한 번 잘못 눌러 키를 잃으면 안 된다. 지우는 것은 따로 누른다.
 */
export default function AiSection() {
  const [stored, setStored] = useState(loadStoredKey)
  const [useOwn, setUseOwn] = useState(stored.enabled)
  const [form, setForm] = useState<OwnKey>(stored.key ?? EMPTY)
  // 확인하는 동안 버튼을 막지 않는다 (busy를 쓰지 않는다) — 전부터 그랬다
  const { message: status, setMessage: setStatus, run } = useTask({ failText: '확인하지 못했습니다.' })
  const complete = form.baseUrl.trim() && form.apiKey.trim() && form.model.trim()

  /** 라디오 전환. 저장된 키는 켜고 끄기만 한다 */
  function choose(own: boolean) {
    setUseOwn(own)
    setOwnKeyEnabled(own)
    setStored((s) => (s.key ? { ...s, enabled: own } : s))
    setStatus(null)
  }

  /** 연결을 확인하고 저장한다. 닿지 못하거나 키가 틀린 것만 저장을 막는다 — 틀린 키로 판정이 조용히 실패하는 것을 막으려는 것이다 */
  function checkAndSave() {
    // 앞뒤 공백은 목록 대조도, 실제 요청도 깨뜨린다
    const clean: OwnKey = { baseUrl: form.baseUrl.trim(), apiKey: form.apiKey.trim(), model: form.model.trim() }
    return run(async () => {
      const result = await checkConnection(clean)
      saveOwnKey(clean)
      setForm(clean)
      setStored({ key: clean, enabled: true })
      return result
    })
  }

  /** 저장된 키를 지운다 (공용 PC 등). 기본 제공 AI로 돌아간다 */
  function forget() {
    saveOwnKey(null)
    setStored({ key: null, enabled: false })
    setForm(EMPTY)
    setUseOwn(false)
    setStatus({ tone: 'ok', text: '저장된 키를 지웠습니다.' })
  }

  const field = (key: keyof OwnKey, label: string, placeholder: string, type = 'text') => (
    <label className="field"><span>{label}</span>
      <input type={type} value={form[key]} placeholder={placeholder} autoComplete="off" onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
    </label>
  )

  return (
    <Card>
      <h2>AI 종 판정</h2>
      <div className="radio-rows" role="radiogroup" aria-label="AI 연결 방식">
        <label><input type="radio" name="ai" checked={!useOwn} onChange={() => choose(false)} />
          <span><strong>기본 제공 AI</strong><small>무료. 여럿이 함께 쓰므로 기다릴 수 있고, 쉬는 시간이 있습니다.</small></span></label>
        <label><input type="radio" name="ai" checked={useOwn} onChange={() => choose(true)} />
          <span><strong>내 API 키 사용</strong><small>OpenAI 호환 서비스. 요금은 그 서비스에 직접 냅니다.</small></span></label>
      </div>
      {!useOwn && stored.key && <p className="hint">저장된 키({stored.key.model})는 그대로 있습니다. 위에서 "내 API 키 사용"을 고르면 다시 씁니다.</p>}
      {useOwn && (
        <div className="key-form">
          {field('baseUrl', '서비스 주소', 'https://api.openai.com/v1')}
          {field('apiKey', 'API 키', 'sk-…', 'password')}
          {field('model', '모델 이름 (사진을 볼 수 있는 모델)', 'gpt-4o')}
          <p className="hint">키는 이 기기에만 저장되고, 백업 파일에도 들어가지 않습니다.</p>
          <Button icon="check" onClick={() => void checkAndSave()} disabled={!complete}>연결 확인하고 저장</Button>
          {stored.key && stored.enabled && !status && <p className="status-line is-ok">저장된 키로 판정하고 있습니다 ({stored.key.model}).</p>}
        </div>
      )}
      {/* 결과 줄과 지우기는 폼 밖에 둔다 — 기본 제공 AI로 돌려 둔 상태에서도 키를 지울 수 있어야 하고(공용 PC), "지웠습니다"는 폼이 닫힌 뒤에 보여야 한다 */}
      <TaskResult message={status} />
      {stored.key && <Button variant="quiet" icon="trash" onClick={forget}>저장된 키 지우기</Button>}
    </Card>
  )
}
