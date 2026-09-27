// 확장자를 적는 이유: node --test가 이 파일을 직접 읽는다 (Vite는 어느 쪽이든 된다)
import { koOf } from '../../../data/species.ts'
import { cleanKoName } from '../koName.ts'
import { wikiQuery } from './wikipedia.ts'

/** 확인하지 못했을 때의 답. 모델이 이름을 지어내지 않게 할 말을 같이 준다 */
function notFound(name: string) {
  return { scientific_name: name, korean_name: null, note: '한국어 이름을 확인하지 못했습니다. 지어내지 말고 korean_name을 비워 두세요.' }
}

/**
 * 한국어 위키백과의 제목이 넘겨주기면 실제 문서 제목으로 푼다. 못 풀면(연결 실패·없는 문서) 받은 제목을 그대로 돌려준다.
 *
 * 왜 한 번 더 묻나: 영어 쪽 요청의 `redirects=1`은 영어 위키백과 안의 넘겨주기만 푼다. 한국어 위키백과에 영문 제목의
 * 넘겨주기 문서가 있으면 언어 연결이 그 제목을 그대로 준다 — 실측(2026-09-27): `Parus minor` → 'Cinereous tit' → 풀면 '박새 (새)'.
 */
async function resolveKoTitle(title: string): Promise<string> {
  const data = await wikiQuery('ko', { redirects: '1', titles: title })
  const pages = (data?.query as { pages?: Record<string, { title?: string; missing?: string }> } | undefined)?.pages
  const page = pages ? Object.values(pages)[0] : undefined
  return page && page.missing === undefined && page.title ? page.title : title
}

/**
 * lookup_korean_name — 학명 → 한국어 이름. 모델이 한국어 이름을 지어내지 못하게 하려는 도구다 — 확인되지 않으면 없다고 답한다.
 * 모델이 읽는 설명·인자(scientific_name)는 definitions.ts에 있다 — 인자 이름을 바꾸면 거기도 바꾼다.
 *
 * 보는 순서: (1) 앱의 종 표(`data/species.ts`) — 요청 없이 바로 답한다 (2) 영어 위키백과의 학명 문서에 연결된 한국어 문서 제목.
 * (2)의 제목은 그대로 믿지 않는다 (작업 20): 한글이 아니면 한국어 위키백과에서 넘겨주기를 풀고, 그래도 국명으로 쓸 수 없으면
 * (영어 제목·'딱따구리과' 같은 과·목·속 이름) 없다고 답한다 — `cleanKoName`.
 *
 * 못 거르는 것: 영어 위키백과가 아종을 종 문서에 합쳐 두면 종의 국명이 온다 (`Motacilla lugens` → 'White wagtail' → '알락할미새').
 * 어느 문서에 닿았는지 `wikipedia_title`로 함께 돌려준다.
 */
export async function koreanName(args: Record<string, unknown>): Promise<unknown> {
  const name = String(args.scientific_name ?? '').trim()
  if (!name) return { error: '학명이 비어 있습니다.' }
  const known = koOf(name)
  if (known) return { scientific_name: name, korean_name: known, source: '앱의 종 표' }

  const data = await wikiQuery('en', { prop: 'langlinks', lllang: 'ko', redirects: '1', titles: name })
  const pages = (data?.query as { pages?: Record<string, { title?: string; langlinks?: Array<{ '*': string }> }> } | undefined)?.pages
  if (!pages) return { error: '위키백과에 닿지 못했습니다.' }
  const page = Object.values(pages)[0]
  const linked = page?.langlinks?.[0]?.['*']
  if (!linked) return notFound(name)
  // 한글 제목이면 실제 문서의 제목이다 — 한 번 더 묻지 않는다 (위키백과는 요청이 잦으면 429로 막는다)
  const korean = cleanKoName(linked) || cleanKoName(await resolveKoTitle(linked))
  return korean
    ? { scientific_name: name, korean_name: korean, source: '위키백과 언어 연결', wikipedia_title: page?.title }
    : notFound(name)
}
