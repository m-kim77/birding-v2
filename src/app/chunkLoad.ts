/**
 * 화면 조각(lazy import)을 받지 못했을 때의 규칙 — 한 번 다시 받아 보고, 그래도 안 되면 새 판이 나왔는지 사이트에 물어
 * 새 판일 때만 한 번 저절로 새로 고친다.
 * Vercel Hobby에는 옛 판 파일을 남겨 두는 기능(Skew Protection)이 없어, 새로 배포하면 열어 둔 앱이 아직 안 받은 화면의 옛 파일은 404다.
 * Vite의 'vite:preloadError'로는 새로 고치지 않는다 — 그 이벤트는 모든 import()의 실패마다(화면이 아닌 exifr도, 다시 받기 전의 첫 실패도) 곧바로 온다.
 * 산에서 신호가 약해 못 받은 것은 새로 고쳐도 낫지 않고, 새로 고침마저 실패하면 홈 화면 앱은 뒤로 버튼도 없는 사파리 오류 페이지에 갇힌다.
 * 이 파일은 값을 import하지 않는다 (node --test가 읽는다 — test/chunkLoad.test.ts). 브라우저 값은 chunkEnv.ts가 읽어 넘긴다.
 */

/** 화면 조각을 두 번 다 받지 못했다. 그 화면 자리의 오류 경계(LoadBoundary)가 이것만 받아 그 자리에 안내를 띄운다 */
export class ChunkLoadError extends Error {
  /** 두 번째 받기의 실패 (브라우저의 영어 문구 — 화면에는 보이지 않고 콘솔에만 남긴다) */
  readonly reason: unknown
  /** 사이트에 물어 새 판이 나온 것을 알았는지. 묻지 못했거나(오프라인·신호 약함) 같은 판이면 false — 안내 문구가 이것으로 갈린다 */
  readonly newBuild: boolean
  constructor(reason: unknown, newBuild = false) {
    super('화면을 받지 못했습니다.')
    this.reason = reason
    this.newBuild = newBuild
  }
}

/** 한 번 실패한 뒤 다시 받기 전에 기다리는 시간 — 잠깐 끊긴 신호가 돌아올 틈 */
export const RETRY_WAIT_MS = 800
/** 이 시간 안에 이미 저절로 새로 고쳤으면 다시 하지 않는다 — 새 판에서도 조각을 못 받으면 새로 고침이 끝없이 돈다 */
export const RELOAD_GUARD_MS = 5 * 60_000

/**
 * 조각을 받는다. 실패하면 `waitMs` 뒤에 **한 번만** 다시 받고, 그래도 실패하면 ChunkLoadError를 던진다 (newBuild는 false).
 * 404(새 판)는 다시 받아도 같지만, 산에서 잠깐 끊긴 신호는 다시 받으면 될 수 있다.
 */
export async function retryOnce<T>(load: () => Promise<T>, waitMs = RETRY_WAIT_MS): Promise<T> {
  try {
    return await load()
  } catch {
    await new Promise((resolve) => setTimeout(resolve, waitMs))
    try { return await load() } catch (e) { throw new ChunkLoadError(e) }
  }
}

/**
 * 저절로 새로 고쳐도 되는지. 오프라인이면 안 된다 — 서비스 워커가 없어 새로 고치면 앱 자체가 안 열린다.
 * `lastAt`은 지난번에 저절로 새로 고친 시각(ms): null이면 없었다, 'unknown'이면 저장소가 막혀 모른다 — 모르면 안 된다 (끝없이 돌 수 있다).
 * 시계가 뒤로 갔으면(지난 시각이 미래) 오래된 것으로 본다.
 */
export function mayAutoReload(lastAt: number | null | 'unknown', now: number, online: boolean): boolean {
  if (!online || lastAt === 'unknown') return false
  return lastAt === null || now < lastAt || now - lastAt > RELOAD_GUARD_MS
}

/**
 * index.html 글에서 앱의 시작 스크립트(src가 있는 첫 `<script type="module">`)의 src를 그대로 꺼낸다.
 * 없으면 null — 사이트가 아닌 글(와이파이 로그인 화면 등)이거나 모양이 바뀐 것이다. 던지지 않는다.
 */
export function entryScriptSrc(html: string): string | null {
  for (const tag of html.match(/<script\b[^>]*>/gi) ?? []) {
    if (!/\stype\s*=\s*["']?module["'\s>]/i.test(tag)) continue
    const src = /\ssrc\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]
    if (src) return src
  }
  return null
}

/**
 * 사이트의 지금 index.html이 지금 열린 앱과 다른 시작 스크립트를 가리키는지 — 그러면 새로 배포된 것이다.
 * 어느 쪽이든 시작 스크립트를 찾지 못하면 false (모르면 새 판이 아닌 것으로 본다 — 새로 고침이 끝없이 돌지 않게).
 */
export function pointsToNewBuild(html: string, currentSrc: string | null): boolean {
  const next = entryScriptSrc(html)
  return currentSrc !== null && next !== null && next !== currentSrc
}

/** loadChunk가 브라우저에서 읽고 하는 것. 실제 값은 chunkEnv.ts, 시험은 가짜를 넘긴다 */
export interface ChunkEnv {
  /** navigator.onLine — 거짓이면 사이트에 묻지도 않는다 */
  online(): boolean
  /** 사이트의 지금 index.html 글 (캐시 없이). 받지 못하면 null — 던지지 않는다 */
  fetchIndexHtml(): Promise<string | null>
  /** 지금 열린 앱의 시작 스크립트 src (index.html에 적힌 그대로). 찾지 못하면 null */
  currentEntry(): string | null
  /** 지난번에 저절로 새로 고친 시각 (mayAutoReload의 lastAt) */
  readStamp(): number | null | 'unknown'
  /** 저절로 새로 고친 시각을 적는다. 적지 못하면 false — 그러면 새로 고치지 않는다 (끝없이 돌 수 있다) */
  writeStamp(at: number): boolean
  reload(): void
  now(): number
}

/**
 * 화면 조각을 받는다 (lazyScreen·lazyPart). 실패하면 한 번 다시 받고(retryOnce), 그래도 안 되면 그때 사이트에 새 판이 나왔는지 묻는다.
 * 새 판이고 `mayReload`이고 mayAutoReload가 허락하고 시각을 적었으면 한 번 새로 고친다 — 방문 기록의 칸은 그대로라 열려던 화면이 새 판으로 열린다 (app/nav.ts startNav).
 * `mayReload`가 거짓이면(쓰던 이름·메모가 있는 화면 안의 조각 — 위치 시트) 새 판이어도 새로 고치지 않는다.
 * 사이트에 닿지 못했거나 같은 판이면 신호가 약해 못 받은 것으로 보고 새로 고치지 않는다.
 * 받지 못하면 어느 경우든 ChunkLoadError(newBuild에 물은 결과)를 던진다 — 새로 고치는 동안이나 고치지 않을 때 그 자리의 LoadBoundary가 안내를 띄운다.
 */
export async function loadChunk<T>(load: () => Promise<T>, mayReload: boolean, env: ChunkEnv, waitMs = RETRY_WAIT_MS): Promise<T> {
  try {
    return await retryOnce(load, waitMs)
  } catch (e) {
    const reason = e instanceof ChunkLoadError ? e.reason : e
    const html = env.online() ? await env.fetchIndexHtml().catch(() => null) : null
    const newBuild = html !== null && pointsToNewBuild(html, env.currentEntry())
    if (newBuild && mayReload && mayAutoReload(env.readStamp(), env.now(), env.online()) && env.writeStamp(env.now())) env.reload()
    throw new ChunkLoadError(reason, newBuild)
  }
}
