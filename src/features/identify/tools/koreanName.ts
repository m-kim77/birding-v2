import { wikiQuery } from './wikipedia'

/**
 * lookup_korean_name — 학명 → 한국어 이름. 영어 위키백과의 학명 문서에 연결된 한국어 문서 제목을 쓴다.
 * 모델이 한국어 이름을 지어내지 못하게 하려는 도구다 — 확인되지 않으면 없다고 답한다.
 * 모델이 읽는 설명·인자(scientific_name)는 definitions.ts에 있다 — 인자 이름을 바꾸면 거기도 바꾼다.
 */
export async function koreanName(args: Record<string, unknown>): Promise<unknown> {
  const name = String(args.scientific_name ?? '').trim()
  if (!name) return { error: '학명이 비어 있습니다.' }
  const data = await wikiQuery('en', { prop: 'langlinks', lllang: 'ko', redirects: '1', titles: name })
  const pages = (data?.query as { pages?: Record<string, { langlinks?: Array<{ '*': string }> }> } | undefined)?.pages
  if (!pages) return { error: '위키백과에 닿지 못했습니다.' }
  const korean = Object.values(pages)[0]?.langlinks?.[0]?.['*']
  return korean
    ? { scientific_name: name, korean_name: korean, source: '위키백과 언어 연결' }
    : { scientific_name: name, korean_name: null, note: '한국어 이름을 확인하지 못했습니다. 지어내지 말고 korean_name을 비워 두세요.' }
}
