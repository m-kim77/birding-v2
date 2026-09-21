import { useState } from 'react'
import { Card } from '../../ui/bits'
import Button from '../../ui/Button'
import { loadOwnKey, saveOwnKey, type OwnKey } from '../identify/connection'

const EMPTY: OwnKey = { baseUrl: 'https://api.openai.com/v1', apiKey: '', model: '' }

/**
 * 연결을 확인한다: 그 서비스의 모델 목록을 읽어 본다. 키가 맞으면 목록이 오고, 고른 모델이 거기 있는지도 본다.
 * 몇 분 걸리는 판정이 끝에 가서 "키가 틀렸습니다"로 실패하지 않게 하려는 것이다.
 */
async function checkConnection(own: OwnKey): Promise<string> {
  let res: Response
  try { res = await fetch(`${own.baseUrl.replace(/\/$/, '')}/models`, { headers: { authorization: `Bearer ${own.apiKey}` } }) } catch { throw new Error('그 주소에 닿지 못했습니다. 주소를 확인해 주세요.') }
  if (res.status === 401 || res.status === 403) throw new Error('키가 맞지 않습니다.')
  if (!res.ok) throw new Error(`서비스가 요청을 거절했습니다 (${res.status}).`)
  const ids = (((await res.json()) as { data?: Array<{ id: string }> }).data ?? []).map((m) => m.id)
  if (ids.length && !ids.includes(own.model)) throw new Error(`연결은 됐지만 "${own.model}" 모델이 목록에 없습니다.`)
  return '연결됐습니다.'
}

/**
 * AI 종 판정을 누가 맡는지. 기본 제공 AI(무료, 쉬는 시간이 있다) 또는 내 API 키(요금은 그 서비스에 직접).
 * 키는 이 기기에만 저장한다. 내 키를 쓰면 사진(잘라낸 부분)이 우리 서버를 거치지 않고 그 서비스로 바로 간다.
 */
export default function AiSection() {
  const [saved, setSaved] = useState(loadOwnKey)
  const [useOwn, setUseOwn] = useState(saved !== null)
  const [form, setForm] = useState<OwnKey>(saved ?? EMPTY)
  const [status, setStatus] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null)
  const complete = form.baseUrl.trim() && form.apiKey.trim() && form.model.trim()

  /** 기본 제공 AI로 돌아간다. 저장된 키를 지운다 */
  function chooseDefault() {
    setUseOwn(false)
    saveOwnKey(null)
    setSaved(null)
    setStatus(null)
  }

  /** 연결을 확인하고, 되면 저장한다. 안 되면 저장하지 않는다 — 틀린 키로 판정이 조용히 실패하는 것을 막는다 */
  async function checkAndSave() {
    setStatus(null)
    try {
      const text = await checkConnection(form)
      saveOwnKey(form)
      setSaved(form)
      setStatus({ tone: 'ok', text: `${text} 이제 이 키로 판정합니다.` })
    } catch (e) {
      setStatus({ tone: 'warn', text: e instanceof Error ? e.message : '확인하지 못했습니다.' })
    }
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
        <label><input type="radio" name="ai" checked={!useOwn} onChange={chooseDefault} />
          <span><strong>기본 제공 AI</strong><small>무료. 여럿이 함께 쓰므로 기다릴 수 있고, 쉬는 시간이 있습니다.</small></span></label>
        <label><input type="radio" name="ai" checked={useOwn} onChange={() => setUseOwn(true)} />
          <span><strong>내 API 키 사용</strong><small>OpenAI 호환 서비스. 요금은 그 서비스에 직접 냅니다.</small></span></label>
      </div>
      {useOwn && (
        <div className="key-form">
          {field('baseUrl', '서비스 주소', 'https://api.openai.com/v1')}
          {field('apiKey', 'API 키', 'sk-…', 'password')}
          {field('model', '모델 이름 (사진을 볼 수 있는 모델)', 'gpt-4o')}
          <p className="hint">키는 이 기기에만 저장되고, 백업 파일에도 들어가지 않습니다.</p>
          <Button icon="check" onClick={() => void checkAndSave()} disabled={!complete}>연결 확인하고 저장</Button>
          {saved && !status && <p className="status-line is-ok">저장된 키로 판정하고 있습니다 ({saved.model}).</p>}
          {status && <p className={`status-line is-${status.tone}`} role="status">{status.text}</p>}
        </div>
      )}
    </Card>
  )
}
