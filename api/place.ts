/**
 * 좌표 → 사람이 읽는 장소 이름 (Vercel 함수). v1 `server/lib/place.js`를 옮겼다.
 *
 * 브라우저에서 Nominatim을 직접 부르지 않는 이유: 이용 정책이 "신원을 밝히는 User-Agent"를 요구하는데
 * 브라우저는 User-Agent를 바꿀 수 없다. 키가 필요 없는 대신 정책을 지켜야 한다.
 */
const ENDPOINT = 'https://nominatim.openstreetmap.org/reverse'
const USER_AGENT = 'bird-journal/2.0 (birding journal web app)'

/**
 * Nominatim의 주소 조각을 한국식 큰→작은 순서로 잇는다. 나라마다 채워지는 키가 달라 있는 것만 고른다.
 * 쓸 조각이 하나도 없으면 빈 문자열.
 */
export function formatPlace(address: Record<string, string> | null | undefined): string {
  const a = address ?? {}
  const parts = [a.province || a.state, a.city || a.county, a.borough, a.town || a.village || a.suburb]
    .filter((part): part is string => typeof part === 'string' && part.trim() !== '')
  // 같은 이름이 두 단계에 겹쳐 오는 경우가 있다 (city와 county가 같은 값 등)
  return [...new Set(parts)].join(' ')
}

/** 자연 지형·시설 이름. 탐조지는 도로명보다 저수지·습지·공원 이름이 훨씬 쓸모 있다 */
export function formatFeature(address: Record<string, string> | null | undefined): string {
  const a = address ?? {}
  const feature = a.water || a.natural || a.leisure || a.tourism
  return typeof feature === 'string' ? feature.trim() : ''
}

/**
 * GET /api/place?lat=..&lng=.. → { place: string }.
 * **어떤 실패에도 오류를 내지 않고 빈 이름을 준다** — 장소 이름이 없어도 기록은 저장돼야 하고, 좌표는 이미 있다.
 * 같은 자리는 CDN이 하루 동안 기억한다 (좌표를 소수 4자리 ≈ 11m로 뭉갠 주소를 브라우저가 부른다).
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const lat = Number(url.searchParams.get('lat'))
  const lng = Number(url.searchParams.get('lng'))
  const empty = Response.json({ place: '' })
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return empty
  try {
    const res = await fetch(`${ENDPOINT}?format=jsonv2&zoom=16&accept-language=ko&lat=${lat}&lon=${lng}`, {
      headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return empty
    const data = (await res.json()) as { address?: Record<string, string> }
    const place = [formatPlace(data.address), formatFeature(data.address)].filter(Boolean).join(' · ')
    return Response.json({ place }, { headers: { 'cache-control': 'public, s-maxage=86400, max-age=86400' } })
  } catch {
    return empty
  }
}
