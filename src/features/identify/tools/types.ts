/**
 * 도구 하나의 실행부. 모델이 읽는 정의(이름·설명·인자)는 `definitions.ts`에 있고, 이름과 실행부의 짝은 `index.ts`가 맞춘다.
 * 도구를 더하려면: `definitions.ts` 배열 **끝에** 정의 하나 → 실행 파일 하나 → `index.ts`의 RUNNERS에 한 줄. 루프(loop.ts)는 고치지 않는다.
 *
 * 돌려준 값은 JSON으로 바뀌어 모델에게 간다.
 * **던지지 않는다** — 실패는 `{ error: '…' }`로 돌려준다. 그래야 모델이 다른 검색어로 다시 시도할 수 있다.
 */
export type ToolRun = (args: Record<string, unknown>) => Promise<unknown>

/** 도구 결과의 글자 수 상한. 결과가 길면 대화가 불어나 턴마다 느려진다 (v1 MAX_EXTRACT_CHARS와 같은 역할) */
export const MAX_RESULT_CHARS = 3000
