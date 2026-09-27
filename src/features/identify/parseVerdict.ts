import type { Verdict } from '../../types'
// 확장자를 적는 이유: node --test가 이 파일을 직접 읽는다 (Vite는 어느 쪽이든 된다)
import { cleanKoName } from './koName.ts'

/**
 * 모델의 마지막 글에서 판정 JSON을 꺼낸다. 순수 함수다 (node --test로 검사한다).
 *
 * 모델은 시킨 대로만 답하지 않는다 — 생각 태그(<think>), 코드 울타리(```json), 앞뒤 인사말이 붙는다.
 * 그래서 "가장 바깥 중괄호 한 쌍"을 찾아 읽는다. 읽을 수 없거나 학명·이름이 둘 다 없으면 null.
 *
 * **국명은 믿지 않고 거른다** (작업 20). 한글 이름이 아니면(영어 이름·학명·과 이름) 버리고, `allowedKo`를 주면
 * 그 안에 있는 이름만 남긴다 — 판정 루프는 종 표의 이름과 이번 판정에서 도구가 돌려준 이름을 넣는다 (모델이 지어낸 국명을 막는다).
 * 버린 이름은 `unverifiedName`에 남기고 판정은 '좁힘'으로 내린다. 후보 칩(others)도 같은 그물을 지난다 — 누르면 이름 칸에 들어가기 때문이다.
 */
export function parseVerdict(text: string, model: string, allowedKo?: ReadonlySet<string>): Verdict | null {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, '')
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  let raw: Record<string, unknown>
  try { raw = JSON.parse(cleaned.slice(start, end + 1)) } catch { return null }

  /** 국명으로 쓸 수 있고 확인된 이름이면 그 이름, 아니면 빈 문자열 */
  const checked = (v: unknown): string => {
    const name = cleanKoName(v)
    return name && (!allowedKo || allowedKo.has(name)) ? name : ''
  }
  const written = str(raw.korean_name)
  const speciesKo = checked(written)
  const latin = str(raw.scientific_name)
  if (!speciesKo && !latin) return null
  const evidence = Array.isArray(raw.evidence)
    ? raw.evidence.map((e) => ({ text: str((e as Record<string, unknown>)?.text), source: str((e as Record<string, unknown>)?.source) })).filter((e) => e.text)
    : []
  const others = Array.isArray(raw.others) ? raw.others.map(checked).filter((o) => o && o !== speciesKo) : []
  const verdict: Verdict = {
    // '확정'이 아닌 모든 값은 '좁힘'으로 본다 — 모델이 모호하게 답했을 때 확정으로 읽으면 안 된다.
    // 적어 낸 국명을 버렸을 때도 '좁힘'이다 — 확인 안 된 이름을 적는 답은 규칙을 어긴 답이라 확정으로 올리지 않는다
    kind: raw.verdict === '확정' && (written === '' || speciesKo !== '') ? '확정' : '좁힘',
    speciesKo, latin, summary: str(raw.summary), evidence,
    others: [...new Set(others)],
    model,
  }
  // 없는 값은 키를 만들지 않는다 — 저장된 판정과 모양이 같게
  if (written && !speciesKo) verdict.unverifiedName = written
  return verdict
}

/** 글자가 아니면 빈 문자열 */
function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}
