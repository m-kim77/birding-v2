import type { Tool } from './types'
import { langOf, wikiQuery } from './wikipedia'

/** 위키백과에서 문서 제목을 찾는다. 후보 종의 문서가 어떤 제목으로 있는지 알아내는 첫 단계 */
export const searchWikipedia: Tool = {
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
  async run(args) {
    const query = String(args.query ?? '').trim()
    if (!query) return { error: '검색어가 비어 있습니다.' }
    const data = await wikiQuery(langOf(args), { list: 'search', srsearch: query, srlimit: '5' })
    const hits = (data?.query as { search?: Array<{ title: string; snippet: string }> } | undefined)?.search
    if (!hits) return { error: '위키백과에 닿지 못했습니다.' }
    // snippet에는 강조용 HTML이 섞여 있다 — 글자만 남긴다
    return { results: hits.map((h) => ({ title: h.title, snippet: h.snippet.replace(/<[^>]+>/g, '') })) }
  },
}
