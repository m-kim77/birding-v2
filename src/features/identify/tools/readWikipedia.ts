import { MAX_RESULT_CHARS } from './types'
import { langOf, wikiQuery } from './wikipedia'

/**
 * read_wikipedia — 위키백과 문서의 본문을 읽는다. 생김새·분포·서식지 근거는 여기서 나온다.
 * 모델이 읽는 설명·인자(title·lang)는 definitions.ts에 있다 — 인자 이름을 바꾸면 거기도 바꾼다.
 */
export async function readWikipedia(args: Record<string, unknown>): Promise<unknown> {
  const title = String(args.title ?? '').trim()
  if (!title) return { error: '제목이 비어 있습니다.' }
  const lang = langOf(args)
  const data = await wikiQuery(lang, { prop: 'extracts|pageimages', explaintext: '1', redirects: '1', titles: title, piprop: 'thumbnail', pithumbsize: '480' })
  const pages = (data?.query as { pages?: Record<string, { title: string; extract?: string; missing?: string; thumbnail?: { source: string } }> } | undefined)?.pages
  const page = pages ? Object.values(pages)[0] : undefined
  if (!page) return { error: '위키백과에 닿지 못했습니다.' }
  if (page.missing !== undefined || !page.extract) return { error: `"${title}" 문서가 없습니다. search_wikipedia로 제목을 다시 찾아보세요.` }
  return {
    title: page.title, source: `위키백과(${lang}) · ${page.title}`, text: page.extract.slice(0, MAX_RESULT_CHARS),
    // url·image는 모델보다 사용자를 위한 것이다 — 루프가 모아서 "참고한 자료"로 보여 준다 (loop.ts collectReference)
    url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
    image: page.thumbnail?.source,
  }
}
