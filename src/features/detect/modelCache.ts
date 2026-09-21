/**
 * 모델 파일을 브라우저 Cache Storage에 받아 둔다. 한 번 받으면 인터넷 없이도 쓴다.
 * HTTP 캐시에 맡기지 않는 이유: 브라우저가 마음대로 비울 수 있고, "받았는지"를 앱이 알 수 없다.
 */
const CACHE_NAME = 'models-v1'

/** 이 주소의 파일이 이미 받아져 있는지. Cache Storage를 못 쓰는 환경이면 false */
export async function isModelCached(url: string): Promise<boolean> {
  try { return (await (await caches.open(CACHE_NAME)).match(url)) !== undefined } catch { return false }
}

/**
 * 모델 파일을 읽는다. 받아 둔 것이 있으면 그것을, 없으면 내려받으며 진행률을 알리고 받아 둔다.
 * 내려받기에 실패하면 한국어 Error. Cache Storage에 넣지 못해도(저장 공간 부족 등) 이번 실행에는 쓴다.
 */
export async function fetchModel(url: string, onProgress: (fraction: number) => void): Promise<Uint8Array> {
  const cache = await caches.open(CACHE_NAME).catch(() => null)
  const hit = await cache?.match(url)
  if (hit) { onProgress(1); return new Uint8Array(await hit.arrayBuffer()) }

  let res: Response
  try { res = await fetch(url) } catch { throw new Error('모델을 받지 못했습니다. 인터넷 연결을 확인해 주세요.') }
  if (!res.ok || !res.body) throw new Error(`모델을 받지 못했습니다 (${res.status}).`)

  const total = Number(res.headers.get('content-length')) || 0
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

/** 받아 둔 파일을 지운다 */
export async function dropModel(url: string): Promise<void> {
  await (await caches.open(CACHE_NAME)).delete(url).catch(() => undefined)
}
