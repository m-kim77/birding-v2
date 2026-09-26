import { TOOL_DEFINITIONS, type ToolName } from './definitions'
import { koreanName } from './koreanName'
import { readWikipedia } from './readWikipedia'
import { searchWikipedia } from './searchWikipedia'
import type { ToolRun } from './types'

// 도구 정의(모델이 읽는 설명·인자)와 그 순서는 definitions.ts 한 곳이 정한다. 판정 루프는 여기서 함께 가져간다
export { toolSchemas } from './definitions'

/**
 * 도구 이름 → 실행부. 키의 타입이 정의의 이름(ToolName)에서 나오므로, 정의만 더하고 실행부를 빠뜨리거나
 * 없는 이름을 적으면 `npm run check`의 타입 검사가 막는다. 여기 적는 순서는 요청과 상관없다.
 */
const RUNNERS: Record<ToolName, ToolRun> = {
  search_wikipedia: searchWikipedia,
  read_wikipedia: readWikipedia,
  lookup_korean_name: koreanName,
}

/** 이름으로 도구를 실행한다. 모르는 이름이면 오류를 결과로 돌려준다 (모델이 없는 도구를 지어낼 때가 있다) */
export async function runTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  // hasOwn: 모델이 'constructor' 같은 이름을 부르면 객체의 물려받은 속성이 실행부로 잡힌다
  const run = Object.hasOwn(RUNNERS, name) ? RUNNERS[name as ToolName] : undefined
  return run ? run(args) : { error: `"${name}"이라는 도구는 없습니다. 쓸 수 있는 도구: ${TOOL_DEFINITIONS.map((t) => t.name).join(', ')}` }
}
