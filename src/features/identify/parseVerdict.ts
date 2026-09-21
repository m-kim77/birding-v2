import type { Verdict } from '../../types'

/**
 * 모델의 마지막 글에서 판정 JSON을 꺼낸다. 순수 함수다 (node --test로 검사한다).
 *
 * 모델은 시킨 대로만 답하지 않는다 — 생각 태그(<think>), 코드 울타리(```json), 앞뒤 인사말이 붙는다.
 * 그래서 "가장 바깥 중괄호 한 쌍"을 찾아 읽는다. 읽을 수 없거나 학명·이름이 둘 다 없으면 null.
 */
export function parseVerdict(text: string, model: string): Verdict | null {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, '')
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  let raw: Record<string, unknown>
  try { raw = JSON.parse(cleaned.slice(start, end + 1)) } catch { return null }

  const speciesKo = str(raw.korean_name)
  const latin = str(raw.scientific_name)
  if (!speciesKo && !latin) return null
  const evidence = Array.isArray(raw.evidence)
    ? raw.evidence.map((e) => ({ text: str((e as Record<string, unknown>)?.text), source: str((e as Record<string, unknown>)?.source) })).filter((e) => e.text)
    : []
  return {
    // '확정'이 아닌 모든 값은 '좁힘'으로 본다 — 모델이 모호하게 답했을 때 확정으로 읽으면 안 된다
    kind: raw.verdict === '확정' ? '확정' : '좁힘',
    speciesKo, latin, summary: str(raw.summary), evidence,
    others: Array.isArray(raw.others) ? raw.others.map(str).filter(Boolean) : [],
    model,
  }
}

/** 글자가 아니면 빈 문자열 */
function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}
