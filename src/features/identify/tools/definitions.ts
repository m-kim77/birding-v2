/**
 * 도구 정의 — 모델이 읽는 부분(이름·설명·인자)만 모은 곳. 실행 코드는 도구마다 파일 하나(`searchWikipedia.ts` 등), 둘의 짝은 `index.ts`.
 *
 * **이 파일은 값을 import하지 않는다.** 서버(`api/`)도 이 파일을 읽어 기본 제공 AI에 보낼 도구를 정한다 —
 * 실행 코드(위키백과 호출)나 브라우저 전용 코드를 서버로 끌고 가지 않으려고 정의만 따로 둔다.
 * 값을 import해야 하면 경로에 `.ts`를 적는다 (확장자 없는 경로는 배포된 함수에서 못 찾는다 — CLAUDE.md).
 *
 * **순서를 바꾸지 않는다** — 도구 정의는 매 요청의 맨 앞에 실리고, 앞부분이 한 글자라도 바뀌면
 * LLM 서버의 KV 캐시가 처음부터 다시 계산된다. 새 도구는 배열 **끝에** 더한다.
 *
 * 모든 도구의 정의를 매 요청에 함께 보낸다. "필요할 때 하나씩 알려 주는" 방식은 쓰지 않는다:
 * 모델은 들은 적 없는 도구를 부를 수 없고, 도구가 몇 개뿐일 때는 정의를 다 보내는 비용(수백 토큰)이
 * 도구를 고르는 왕복 한 번보다 훨씬 싸다. 도구가 수십 개로 늘면 그때 다시 생각한다.
 */
export interface ToolDefinition {
  /** 모델이 부르는 이름. 영문 snake_case (모델들이 가장 안정적으로 다루는 형태) */
  name: string
  /** 모델이 읽는 설명. 언제 쓰는 도구인지가 드러나야 한다 */
  description: string
  /** 인자의 JSON Schema. 실행 파일이 읽는 인자 이름과 같아야 한다 */
  parameters: Record<string, unknown>
}

export const TOOL_DEFINITIONS = [
  {
    name: 'search_wikipedia',
    description: '위키백과에서 검색어에 맞는 문서 제목을 최대 5개 찾는다. 새의 한국어 이름이나 학명으로 검색한다.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '검색어 (새 이름 또는 학명)' },
        lang: { type: 'string', enum: ['ko', 'en'], description: '위키백과 언어. 기본 ko' },
      },
      required: ['query'],
    },
  },
  {
    name: 'read_wikipedia',
    description: '위키백과 문서의 본문(앞부분)을 읽는다. 새의 생김새, 분포, 서식지를 확인할 때 쓴다. 제목은 search_wikipedia로 찾은 것을 그대로 넣는다.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '문서 제목' },
        lang: { type: 'string', enum: ['ko', 'en'], description: '위키백과 언어. 기본 ko' },
      },
      required: ['title'],
    },
  },
  {
    name: 'lookup_korean_name',
    description: '새의 학명으로 한국어 이름(국명)을 확인한다. 최종 답의 한국어 이름은 반드시 이 도구로 확인된 것이어야 한다.',
    parameters: {
      type: 'object',
      properties: { scientific_name: { type: 'string', description: '학명 (예: Alcedo atthis)' } },
      required: ['scientific_name'],
    },
  },
  // `as const`: 도구 이름을 글자 그대로의 타입(ToolName)으로 남긴다 — index.ts가 실행부 빠짐을 타입 검사로 잡는 재료
] as const satisfies readonly ToolDefinition[]

/** 정의된 도구 이름들 ('search_wikipedia' | …) */
export type ToolName = (typeof TOOL_DEFINITIONS)[number]['name']

/**
 * OpenAI 형식의 도구 정의. 판정 루프(`loop.ts`, 내 키로 보낼 때)와 서버(기본 제공 AI)가 같은 것을 쓴다.
 * 부를 때마다 새 배열을 만든다 — 받는 쪽이 고쳐도 정의 원본은 그대로다.
 */
export function toolSchemas() {
  return TOOL_DEFINITIONS.map((t) => ({ type: 'function' as const, function: { name: t.name, description: t.description, parameters: t.parameters } }))
}
