/**
 * AI 판정 결과의 **보이는 말** 한 곳 — 저장값과 화면 글자를 가른다.
 *
 * 저장값은 `types.ts`의 `Verdict.kind` '확정'|'좁힘' 그대로다. 기록(IndexedDB)·초안·백업 ZIP·드라이브 사본에 그 글자로 들어 있고,
 * 읽을 때 `data/normalizeSighting.ts`가 이 두 값이 아니면 판정을 통째로 버린다. 모델과의 약속(`parseVerdict.ts`, 고정 프롬프트)도
 * 같은 글자다. 그래서 **저장값을 바꾸면 옛 기록의 AI 근거가 말없이 사라진다** — 이 파일은 그 값을 화면에 어떻게 말할지만 정한다.
 * 결과를 가리키는 화면 글자(머리글·초안 안내·수정 경고·근거 안내)는 여기서만 만든다.
 *
 * import는 타입뿐인 순수 파일이다 (node --test가 직접 읽는다 — test/verdictText.test.ts).
 */
import type { Verdict } from '../../types'

/** 저장값 → 결과 머리글. 저장값을 그대로 찍지 않는다 */
const HEADING: Record<Verdict['kind'], string> = {
  확정: 'AI 판정 · 확정',
  좁힘: 'AI 판정 · 좁힘',
}

/** 결과를 가리키는 낱말 — 초안 안내("쓰던 기록이 있습니다 — … · AI 판정 · 메모")가 쓴다 */
export const VERDICT_NOUN = 'AI 판정'

/** 기록 수정에서 이름을 바꿀 때의 경고 — 이름을 바꾸면 근거를 떼는 것은 의도된 동작이라(`editPatch`) 말없이 지우지 않는다 */
export const EVIDENCE_LOSS_WARNING = '이름을 바꾸면 이 기록의 AI 판정 근거가 지워집니다.'

/**
 * 판정 결과 머리글 — 새 기록의 결과와 기록 상세의 판정 카드가 같은 말을 쓴다.
 * 표에 없는 값(저장값이 망가진 경우)은 그 값을 그대로 붙여 보여 준다 — 빈 머리글보다 낫다.
 */
export function verdictHeading(kind: Verdict['kind']): string {
  return HEADING[kind] ?? `${VERDICT_NOUN} · ${kind}`
}

/**
 * 도구를 한 번도 안 쓰고 낸 답에 붙이는 경고 한 문장. 저장값이 '확정'이면 근거가 약할 수 있다는 말이 더 붙는다.
 * 표에 없는 값은 '확정'이 아니므로 짧은 쪽이다.
 */
export function uncheckedNote(kind: Verdict['kind']): string {
  return kind === '확정'
    ? '자료를 확인하지 않고 답했습니다 — 확정이라도 근거가 약할 수 있습니다.'
    : '자료를 확인하지 않고 답했습니다.'
}
