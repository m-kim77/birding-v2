import { koreanName } from './koreanName'
import { readWikipedia } from './readWikipedia'
import { searchWikipedia } from './searchWikipedia'
import type { Tool } from './types'

/**
 * 도구 목록. **순서를 바꾸지 않는다** — 도구 정의는 매 요청의 맨 앞에 실리고,
 * 앞부분이 한 글자라도 바뀌면 LLM 서버의 KV 캐시가 처음부터 다시 계산된다.
 *
 * 모든 도구의 정의를 매 요청에 함께 보낸다. "필요할 때 하나씩 알려 주는" 방식은 쓰지 않는다:
 * 모델은 들은 적 없는 도구를 부를 수 없고, 도구가 몇 개뿐일 때는 정의를 다 보내는 비용(수백 토큰)이
 * 도구를 고르는 왕복 한 번보다 훨씬 싸다. 도구가 수십 개로 늘면 그때 다시 생각한다.
 */
export const TOOLS: Tool[] = [searchWikipedia, readWikipedia, koreanName]

/** OpenAI 형식의 도구 정의 */
export function toolSchemas() {
  return TOOLS.map((t) => ({ type: 'function' as const, function: { name: t.name, description: t.description, parameters: t.parameters } }))
}

/** 이름으로 도구를 실행한다. 모르는 이름이면 오류를 결과로 돌려준다 (모델이 없는 도구를 지어낼 때가 있다) */
export async function runTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const tool = TOOLS.find((t) => t.name === name)
  return tool ? tool.run(args) : { error: `"${name}"이라는 도구는 없습니다. 쓸 수 있는 도구: ${TOOLS.map((t) => t.name).join(', ')}` }
}
