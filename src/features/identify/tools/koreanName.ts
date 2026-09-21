import type { Tool } from './types'
import { wikiQuery } from './wikipedia'

/**
 * 학명 → 한국어 이름. 영어 위키백과의 학명 문서에 연결된 한국어 문서 제목을 쓴다.
 * 모델이 한국어 이름을 지어내지 못하게 하려는 도구다 — 확인되지 않으면 없다고 답한다.
 */
export const koreanName: Tool = {
  name: 'lookup_korean_name',
  description: '새의 학명으로 한국어 이름(국명)을 확인한다. 최종 답의 한국어 이름은 반드시 이 도구로 확인된 것이어야 한다.',
  parameters: {
    type: 'object',
    properties: { scientific_name: { type: 'string', description: '학명 (예: Alcedo atthis)' } },
    required: ['scientific_name'],
  },
  async run(args) {
    const name = String(args.scientific_name ?? '').trim()
    if (!name) return { error: '학명이 비어 있습니다.' }
    const data = await wikiQuery('en', { prop: 'langlinks', lllang: 'ko', redirects: '1', titles: name })
    const pages = (data?.query as { pages?: Record<string, { langlinks?: Array<{ '*': string }> }> } | undefined)?.pages
    if (!pages) return { error: '위키백과에 닿지 못했습니다.' }
    const korean = Object.values(pages)[0]?.langlinks?.[0]?.['*']
    return korean
      ? { scientific_name: name, korean_name: korean, source: '위키백과 언어 연결' }
      : { scientific_name: name, korean_name: null, note: '한국어 이름을 확인하지 못했습니다. 지어내지 말고 korean_name을 비워 두세요.' }
  },
}
