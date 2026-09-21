/** 위키백과 API 공통 부분. `origin=*`를 붙이면 브라우저에서 바로 부를 수 있다 (CORS 허용) */
export type WikiLang = 'ko' | 'en'

/**
 * 위키백과 API를 부른다. 실패하면 null — 도구는 던지지 않고 실패를 결과로 돌려줘야 한다.
 */
export async function wikiQuery(lang: WikiLang, params: Record<string, string>): Promise<Record<string, unknown> | null> {
  const query = new URLSearchParams({ action: 'query', format: 'json', origin: '*', ...params })
  try {
    const res = await fetch(`https://${lang}.wikipedia.org/w/api.php?${query}`, { signal: AbortSignal.timeout(10_000) })
    return res.ok ? ((await res.json()) as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** 인자에서 언어를 읽는다. 'en'이 아니면 전부 한국어로 본다 */
export function langOf(args: Record<string, unknown>): WikiLang {
  return args.lang === 'en' ? 'en' : 'ko'
}
