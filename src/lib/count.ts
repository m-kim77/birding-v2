/**
 * 개체 수(`Sighting.count`)의 규칙 한 곳. 새 기록·빠른 기록·수정 칸·백업과 기기 기록 읽기(data/normalizeSighting.ts)가 같이 쓴다.
 * 순수 함수이고 import가 없다 — 기록 상세와 수정 칸(첫 화면 묶음)이 부르므로 가볍게 둔다. node --test가 직접 읽는다.
 *
 * 개체 수는 1 이상의 정수만 받는다. 어림('약 300')·범위('10~20')는 메모에 적는다 — 숫자여야 나중에 세거나 내보낼 수 있다.
 * 값이 없으면 '세지 않음'이다. 옛 기록에 1을 채우지 않는다 — 세지 않은 것을 1마리로 지어내는 셈이다.
 */

/** 받는 가장 큰 개체 수. 이보다 크면 잘못 친 값으로 본다 */
export const MAX_COUNT = 999_999

/**
 * 저장된 값을 개체 수로 읽는다 — 1~MAX_COUNT의 정수면 그 수, 아니면 undefined (세지 않음).
 * 글자('3')·0·음수·소수·NaN·너무 큰 수는 받지 않는다 (손으로 고친 백업의 값이 화면과 셈에 그대로 들어가지 않게).
 */
export function countOf(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= MAX_COUNT ? v : undefined
}

/**
 * 입력칸의 글자를 개체 수로 읽는다. 앞뒤 공백은 뗀다. 빈칸·0·음수·소수·글자·너무 큰 수는 undefined (세지 않음).
 * 0~9만으로 된 글자만 받는다 — '1e3'·'0x10'처럼 Number()가 숫자로 읽어 주는 다른 모양은 받지 않는다.
 */
export function parseCount(text: string): number | undefined {
  const t = text.trim()
  return /^[0-9]+$/.test(t) ? countOf(Number(t)) : undefined
}

/** 입력칸의 글자가 개체 수로 읽히지 않는 값인지 — 비어 있으면 아니다 (비워 두는 것은 '세지 않음'이라 괜찮다). 칸 밑의 안내가 쓴다 */
export function isBadCount(text: string): boolean {
  return text.trim() !== '' && parseCount(text) === undefined
}

/** 화면에 보이는 개체 수 — '3마리', '1,200마리'. 세지 않았으면(또는 개체 수로 읽히지 않는 값이면) '' — 목록 줄에서 filter(Boolean)으로 빠진다 */
export function countText(n: number | undefined): string {
  const c = countOf(n)
  return c === undefined ? '' : `${c.toLocaleString('ko-KR')}마리`
}
