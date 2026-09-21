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

const STORAGE_KEY = 'bird-journal:own-llm'

/** 저장된 내 키 설정을 읽는다. 없거나 깨졌거나 localStorage가 막혀 있으면 null (= 기본 제공 AI) */
export function loadOwnKey(): OwnKey | null {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<OwnKey> | null
    return v?.baseUrl && v.apiKey && v.model ? { baseUrl: v.baseUrl, apiKey: v.apiKey, model: v.model } : null
  } catch {
    return null
  }
}

/** 내 키 설정을 저장한다. null이면 지운다 (기본 제공 AI로 돌아간다) */
export function saveOwnKey(value: OwnKey | null): void {
  try {
    if (value) localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); else localStorage.removeItem(STORAGE_KEY)
  } catch { /* 저장이 막힌 환경이면 이번 세션에만 쓴다 */ }
}

/** 요청을 보낼 주소와 헤더, 그리고 기록에 남길 모델 이름 */
export function endpointFor(own: OwnKey | null): { url: string; headers: Record<string, string>; model: string } {
  if (!own) return { url: '/api/llm', headers: {}, model: '기본 제공 AI' }
  return { url: `${own.baseUrl.replace(/\/$/, '')}/chat/completions`, headers: { authorization: `Bearer ${own.apiKey}` }, model: own.model }
}
