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
