import { langOf, wikiQuery } from './wikipedia'

/**
 * search_wikipedia — 위키백과에서 문서 제목을 찾는다. 후보 종의 문서가 어떤 제목으로 있는지 알아내는 첫 단계.
 * 모델이 읽는 설명·인자(query·lang)는 definitions.ts에 있다 — 인자 이름을 바꾸면 거기도 바꾼다.
 */
export async function searchWikipedia(args: Record<string, unknown>): Promise<unknown> {
  const query = String(args.query ?? '').trim()
  if (!query) return { error: '검색어가 비어 있습니다.' }
  const data = await wikiQuery(langOf(args), { list: 'search', srsearch: query, srlimit: '5' })
  const hits = (data?.query as { search?: Array<{ title: string; snippet: string }> } | undefined)?.search
  if (!hits) return { error: '위키백과에 닿지 못했습니다.' }
  // snippet에는 강조용 HTML이 섞여 있다 — 글자만 남긴다
  return { results: hits.map((h) => ({ title: h.title, snippet: h.snippet.replace(/<[^>]+>/g, '') })) }
}
