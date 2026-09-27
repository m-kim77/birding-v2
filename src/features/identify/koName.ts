/**
 * 국명(한국어 종 이름)으로 쓸 수 있는 글자만 통과시키는 그물. 순수 함수다 (node --test로 검사한다) — 값을 import하지 않는다.
 *
 * 이름 칸에 닿는 길 셋이 모두 여기를 지난다: 국명 도구의 결과(`tools/koreanName.ts`), 모델의 답(`parseVerdict.ts`의
 * korean_name과 후보 칩 others), 도구 결과에서 "확인된 이름"을 모을 때(`loop.ts`).
 * v1 `llm_id_test/src/birdllm/tools.py`에 있던 그물을 옮긴 것이다 — v2로 오며 빠져서 박새가 "Cinereous tit"로 들어갔다 (작업 20).
 */

/** 제목 끝의 괄호 꼬리표. 한국어 위키백과의 동음이의 표시다: '박새 (새)' → '박새' */
const TAIL = /\s*\([^)]*\)\s*$/

/**
 * 한글 낱말만 (사이의 빈칸 하나는 받는다). 영어·학명·'A / B'처럼 둘을 붙인 글·한글과 영어가 섞인 글을 막는다.
 * v1은 "한글이 하나라도 있으면" 받았다 — 그러면 '박새 Cinereous tit'이 지나간다.
 */
const HANGUL_WORDS = /^[가-힣]+(?: [가-힣]+)*$/

/**
 * 종이 아니라 분류 계급을 가리키는 꼬리. 학명 자리에 'Picidae'가 오면 위키백과가 '딱따구리과'를 돌려준다 —
 * 값이 비어 있지 않아 그대로 국명 자리에 앉는다 (v1 실측).
 */
const RANK = /(과|목|속|아과|아목|상과|하목|류)$/

/**
 * 국명으로 쓸 수 있게 다듬는다: 앞뒤 공백과 괄호 꼬리표를 떼고, 한글 이름이 아니거나 과·목·속 이름이면 버린다.
 * 쓸 수 없으면 빈 문자열 (글자가 아닌 값도). 던지지 않는다.
 * 이름이 실제로 있는 새인지는 모른다 — 그건 부르는 쪽이 "도구가 확인한 이름"과 견준다 (`parseVerdict`의 allowedKo).
 */
export function cleanKoName(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  const name = raw.replace(TAIL, '').trim()
  return HANGUL_WORDS.test(name) && !RANK.test(name) ? name : ''
}

/**
 * 도구 결과 하나에서 국명으로 쓸 수 있는 이름을 모은다 — 국명 도구의 `korean_name`, 읽은 문서의 `title`, 검색 결과의 `results[].title`.
 * 판정 루프가 "이번 판정에서 자료로 확인된 이름"을 쌓는 재료다. 영어 문서 제목은 `cleanKoName`에서 떨어진다.
 * 결과가 오류이거나 모양이 달라도 빈 배열 (던지지 않는다).
 */
export function koNamesIn(result: unknown): string[] {
  if (typeof result !== 'object' || result === null) return []
  const r = result as { korean_name?: unknown; title?: unknown; results?: unknown }
  const hits = Array.isArray(r.results) ? r.results.map((h) => (h as { title?: unknown } | null)?.title) : []
  return [r.korean_name, r.title, ...hits].map(cleanKoName).filter(Boolean)
}
