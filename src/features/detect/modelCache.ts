/**
 * 모델 파일과 그 실행 파일(wasm)을 브라우저 Cache Storage에 받아 둔다. 한 번 받으면 다시 받지 않는다.
 * 그렇다고 오프라인이 되는 것은 아니다 — 앱의 화면 코드와 새 찾기 실행 코드(로더 js 포함)는 브라우저의 보통 캐시에만 있다
 * (서비스 워커가 없다). 화면에 "인터넷 없이"라고 적지 말 것.
 * HTTP 캐시에 맡기지 않는 이유: 브라우저가 마음대로 비울 수 있고, "받았는지"를 앱이 알 수 없다.
 */
const CACHE_NAME = 'models-v1'

/** 이 주소들의 파일이 모두 받아져 있는지. 하나라도 없거나 Cache Storage를 못 쓰는 환경이면 false */
export async function isModelCached(...urls: string[]): Promise<boolean> {
  try {
    const cache = await caches.open(CACHE_NAME)
    for (const url of urls) if ((await cache.match(url)) === undefined) return false
    return true
  } catch {
    return false
  }
}

/**
 * 진행률의 분모. content-length는 압축하지 않고 보낼 때만 믿는다 — 압축해 보내면(우리 사이트가 wasm을 br로 줄인다) 그 값은
 * 줄인 크기인데 읽히는 것은 풀린 바이트라, 받기의 4분의 1쯤에서 막대가 끝난다. 그때는 `expectBytes`(풀린 크기)를 쓰고, 그것도 없으면 0(진행률을 알리지 않음).
 * 다른 출처의 응답은 content-encoding을 읽을 수 없어(null) content-length를 그대로 쓴다.
 */
export function progressTotal(headers: Headers, expectBytes = 0): number {
  const length = headers.get('content-encoding') ? 0 : Number(headers.get('content-length')) || 0
  return length || expectBytes
}

/**
 * 모델 파일을 읽는다. 받아 둔 것이 있으면 그것을, 없으면 내려받으며 진행률을 알리고 받아 둔다.
 * `expectBytes`는 압축해 보내는 파일의 풀린 크기(대략) — 진행률에만 쓴다 (progressTotal).
 * 내려받기에 실패하면 한국어 Error. Cache Storage에 넣지 못해도(저장 공간 부족 등) 이번 실행에는 쓴다.
 */
export async function fetchModel(url: string, onProgress: (fraction: number) => void, expectBytes = 0): Promise<Uint8Array<ArrayBuffer>> {
  const cache = await caches.open(CACHE_NAME).catch(() => null)
  const hit = await cache?.match(url)
  if (hit) { onProgress(1); return new Uint8Array(await hit.arrayBuffer()) }

  let res: Response
  try { res = await fetch(url) } catch { throw new Error('모델을 받지 못했습니다. 인터넷 연결을 확인해 주세요.') }
  if (!res.ok || !res.body) throw new Error(`모델을 받지 못했습니다 (${res.status}).`)

  const total = progressTotal(res.headers, expectBytes)
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let got = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    got += value.length
    if (total) onProgress(Math.min(0.99, got / total))
  }
  const bytes = new Uint8Array(got)
  let at = 0
  for (const c of chunks) { bytes.set(c, at); at += c.length }
  await cache?.put(url, new Response(bytes, { headers: { 'content-type': 'application/octet-stream' } })).catch(() => undefined)
  onProgress(1)
  return bytes
}

/**
 * 여러 파일을 차례로 받을 때 진행률을 막대 하나로 합친다. `weights`는 파일마다의 대략 받는 크기(비율만 쓴다).
 * i번째 함수에 그 파일의 0~1을 주면 앞 파일들의 몫 + 이 파일의 몫 × 값을 `report`로 알린다. 마지막 파일이 1이면 정확히 1.
 * 0~1 밖의 값은 잘라 쓴다. 무게의 합이 0 이하면 똑같이 나눈다.
 */
export function partProgress(weights: number[], report: (fraction: number) => void): Array<(fraction: number) => void> {
  const sum = weights.reduce((a, b) => a + b, 0)
  const shares = weights.map((w) => (sum > 0 ? w / sum : 1 / weights.length))
  let start = 0
  return shares.map((share, i) => {
    const from = start
    const to = i === shares.length - 1 ? 1 : from + share
    start = to
    return (fraction) => report(from + (to - from) * Math.min(1, Math.max(0, fraction)))
  })
}

/**
 * 아직 받지 않은 양(MB) — `parts`는 파일마다 [받을 때 오가는 크기(MB), 이 기기에 있는지]. 다 있으면 0.
 * 화면에 정수로 보이므로 반올림하되, 남은 것이 있는데 0이 되면 1로 올린다 (0MB면 '다 받아 둠'으로 읽힌다).
 * 모델만 받아 둔 기기(wasm을 따로 받아 두기 전 판, 점검 5-9)에 '받기 (10MB)'를 보이면 받은 것을 또 받으라는 말이 된다.
 */
export function sumMissingMb(parts: Array<[mb: number, cached: boolean]>): number {
  const left = parts.reduce((sum, [mb, cached]) => sum + (cached ? 0 : mb), 0)
  return left > 0 ? Math.max(1, Math.round(left)) : 0
}

/** 받아 둔 주소 가운데 `belongs`(이 모델의 파일인지)에 들고 `keep`에 없는 것 — 판이 바뀌어 이름(해시)이 달라진 옛 파일 */
export function staleUrls(cached: string[], belongs: (url: string) => boolean, keep: string[]): string[] {
  return cached.filter((url) => belongs(url) && !keep.includes(url))
}

/**
 * `belongs`에 드는 받아 둔 파일 가운데 `keep`(상대 주소도 된다)에 없는 것을 지운다 — 새 찾기 라이브러리를 올리면 wasm 이름이 바뀌어,
 * 그냥 두면 옛 wasm(약 11MB)이 지우기로도 지워지지 않고 남는다. 실패는 삼킨다 (다음 준비·지우기 때 다시 지운다).
 */
export async function dropStale(belongs: (url: string) => boolean, keep: string[]): Promise<void> {
  try {
    const cache = await caches.open(CACHE_NAME)
    const absolute = keep.map((url) => new URL(url, location.href).href)
    const cached = (await cache.keys()).map((r) => r.url)
    for (const url of staleUrls(cached, belongs, absolute)) await cache.delete(url)
  } catch { /* 위에 적은 대로 */ }
}

/** 받아 둔 파일을 지운다 */
export async function dropModel(url: string): Promise<void> {
  await (await caches.open(CACHE_NAME)).delete(url).catch(() => undefined)
}
