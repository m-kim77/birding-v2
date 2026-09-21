/**
 * LLM이 부를 수 있는 도구 하나. **도구 하나 = 파일 하나**이고, 목록은 `tools/index.ts`에만 있다.
 * 도구를 더하려면 파일을 하나 만들고 index.ts의 배열에 한 줄을 더한다. 루프(loop.ts)는 고치지 않는다.
 */
export interface Tool {
  /** 모델이 부르는 이름. 영문 snake_case (모델들이 가장 안정적으로 다루는 형태) */
  name: string
  /** 모델이 읽는 설명. 언제 쓰는 도구인지가 드러나야 한다 */
  description: string
  /** 인자의 JSON Schema */
  parameters: Record<string, unknown>
  /**
   * 실제로 실행한다. 돌려준 값은 JSON으로 바뀌어 모델에게 간다.
   * **던지지 않는다** — 실패는 `{ error: '…' }`로 돌려준다. 그래야 모델이 다른 검색어로 다시 시도할 수 있다.
   */
  run(args: Record<string, unknown>): Promise<unknown>
}

/** 도구 결과의 글자 수 상한. 결과가 길면 대화가 불어나 턴마다 느려진다 (v1 MAX_EXTRACT_CHARS와 같은 역할) */
export const MAX_RESULT_CHARS = 3000
