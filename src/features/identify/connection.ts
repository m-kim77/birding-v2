/**
 * AI 연결 설정. 두 갈래다:
 * - 기본 제공 AI: `/api/llm`(Vercel 함수)을 거쳐 운영자의 LLM 서버로 간다.
 * - 내 API 키: 브라우저에서 그 서비스로 **직접** 간다. 키가 우리 서버를 지나지 않는다.
 *
 * 키는 이 기기의 localStorage에만 둔다. 서버에 보내거나 백업 파일에 넣지 않는다.
 */
export interface OwnKey {
  /** OpenAI 호환 주소 (예: https://api.openai.com/v1) */
  baseUrl: string
  apiKey: string
  model: string
}

/** 저장된 모양. `enabled`가 false면 키는 두되 기본 제공 AI를 쓴다 (설정에서 잠깐 바꿔 봐도 키가 지워지지 않게) */
interface StoredKey extends OwnKey {
  enabled?: boolean
}

const STORAGE_KEY = 'bird-journal:own-llm'

/** localStorage의 값을 읽는다. 없거나 깨졌거나 막혀 있으면 null */
function readStored(): StoredKey | null {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<StoredKey> | null
    return v?.baseUrl && v.apiKey && v.model ? { baseUrl: v.baseUrl, apiKey: v.apiKey, model: v.model, enabled: v.enabled !== false } : null
  } catch {
    return null
  }
}

/** 판정에 쓸 내 키. 없거나 꺼 두었으면 null (= 기본 제공 AI) */
export function loadOwnKey(): OwnKey | null {
  const v = readStored()
  return v && v.enabled !== false ? { baseUrl: v.baseUrl, apiKey: v.apiKey, model: v.model } : null
}

/** 설정 화면용: 저장된 키(꺼 둔 것 포함)와 켜짐 여부 */
export function loadStoredKey(): { key: OwnKey | null; enabled: boolean } {
  const v = readStored()
  return v ? { key: { baseUrl: v.baseUrl, apiKey: v.apiKey, model: v.model }, enabled: v.enabled !== false } : { key: null, enabled: false }
}

/** 내 키 설정을 켜진 상태로 저장한다. null이면 지운다 (공용 PC에서 키를 남기지 않으려는 사용자를 위해) */
export function saveOwnKey(value: OwnKey | null): void {
  try {
    if (value) localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...value, enabled: true })); else localStorage.removeItem(STORAGE_KEY)
  } catch { /* 저장이 막힌 환경이면 이번 세션에만 쓴다 */ }
}

/** 저장된 키를 지우지 않고 켜고 끈다. 저장된 키가 없으면 아무 일도 없다 */
export function setOwnKeyEnabled(enabled: boolean): void {
  const v = readStored()
  if (!v) return
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...v, enabled })) } catch { /* 위와 같다 */ }
}

/** 요청을 보낼 주소와 헤더, 그리고 기록에 남길 모델 이름 */
export function endpointFor(own: OwnKey | null): { url: string; headers: Record<string, string>; model: string } {
  if (!own) return { url: '/api/llm', headers: {}, model: '기본 제공 AI' }
  return { url: `${own.baseUrl.replace(/\/$/, '')}/chat/completions`, headers: { authorization: `Bearer ${own.apiKey}` }, model: own.model }
}

/** 연결 확인의 결과 한 줄. ok = 연결됐다, warn = 확인하지 못했지만 키는 저장한다 (설정 카드의 결과 줄이 그대로 그린다) */
export interface ConnectionResult {
  tone: 'ok' | 'warn'
  text: string
}

/**
 * 연결을 확인한다: 그 서비스의 모델 목록을 읽어 본다. 키가 맞으면 목록이 오고, 고른 모델이 거기 있는지도 본다.
 * 몇 분 걸리는 판정이 끝에 가서 "키가 틀렸습니다"로 실패하지 않게 하려는 것이다.
 * **던지는 것은 둘뿐이다** — 주소에 닿지 못함, 키가 틀림(401·403). 그때는 저장하지 않는다.
 * 그 밖의 실패(목록을 안 주는 서비스, 잠깐의 5xx, 목록에 없는 모델 이름)는 경고 문구와 함께 **저장은 한다** — 확인이 안 됐을 뿐 키가 틀린 것은 아니다.
 * 이 함수는 저장하지 않는다 (부르는 쪽이 던지지 않고 돌아왔을 때 저장한다). 시간 제한은 두지 않는다 — 브라우저가 포기할 때까지 기다린다.
 * `fetchFn`은 검사에서 가짜로 바꾸려고 받는다.
 */
export async function checkConnection(own: OwnKey, fetchFn: typeof fetch = fetch): Promise<ConnectionResult> {
  let res: Response
  try { res = await fetchFn(`${own.baseUrl.replace(/\/$/, '')}/models`, { headers: { authorization: `Bearer ${own.apiKey}` } }) } catch {
    // 브라우저에서 직접 부르므로 오타·오프라인·그 서비스의 CORS 차단이 전부 여기로 온다 — 어느 쪽인지 앱은 모른다
    throw new Error('주소에 닿지 못했습니다 — 주소 오타이거나, 그 서비스가 브라우저에서 직접 부르는 것을 막고 있을 수 있습니다.')
  }
  if (res.status === 401 || res.status === 403) throw new Error('키가 맞지 않습니다.')
  if (!res.ok) return { tone: 'warn', text: `모델 목록을 확인하지 못했습니다 (${res.status}). 키는 저장했습니다 — 판정이 안 되면 주소와 모델 이름을 확인해 주세요.` }
  let body: { data?: Array<{ id: string }> }
  try { body = (await res.json()) as typeof body } catch {
    return { tone: 'warn', text: '그 주소는 모델 목록 대신 다른 것을 돌려줍니다. 키는 저장했지만, OpenAI 호환 API 주소(…/v1)인지 확인해 주세요.' }
  }
  const ids = (body.data ?? []).map((m) => m.id)
  if (ids.length && !ids.includes(own.model)) return { tone: 'warn', text: `연결은 됐지만 "${own.model}" 모델이 목록에 없습니다. 키는 저장했습니다 — 판정이 안 되면 모델 이름을 확인해 주세요.` }
  return { tone: 'ok', text: '연결됐습니다. 이제 이 키로 판정합니다.' }
}
