import { timeoutSignal } from '../lib/timeoutSignal'
import type { ChunkEnv } from './chunkLoad'
import type { PrefetchEnv } from './prefetch'

/** 지난번에 저절로 새로 고친 시각을 적는 곳 (탭마다 — 다른 탭의 새로 고침과 섞이지 않게) */
const RELOAD_STAMP_KEY = 'bird-journal:new-build-reload-at'
/** 새 판인지 물을 때 index.html을 기다리는 시간. 신호가 약하면 이 안에 안 오고, 그러면 새 판이 아닌 것으로 본다 */
const INDEX_TIMEOUT_MS = 5_000
/** 화면이 뜬 뒤 미리 받기(prefetch.ts)를 시작하기까지 기다리는 시간 — 첫 화면의 사진·글꼴을 받는 동안 끼어들지 않게 */
const PREFETCH_DELAY_MS = 3_000

/**
 * 사이트의 지금 index.html을 캐시 없이 받는다 — 화면 조각을 두 번 다 못 받았을 때만 한 번 (chunkLoad.ts loadChunk).
 * 앱 파일을 받는 것과 같은 사이트의 같은 글이라 보내는 값이 없다. 받지 못하면(시간 초과·오프라인·4xx·5xx) null, 던지지 않는다.
 */
async function fetchIndexHtml(): Promise<string | null> {
  try {
    const res = await fetch('/', { cache: 'no-store', signal: timeoutSignal(INDEX_TIMEOUT_MS) })
    return res.ok ? await res.text() : null
  } catch {
    return null
  }
}

/** 지난번에 저절로 새로 고친 시각. 적힌 적이 없으면 null, 저장소가 막혔으면 'unknown', 깨진 값은 null로 본다 */
function readStamp(): number | null | 'unknown' {
  try {
    const n = Number(sessionStorage.getItem(RELOAD_STAMP_KEY) ?? NaN)
    return Number.isFinite(n) ? n : null
  } catch {
    return 'unknown'
  }
}

/** 저절로 새로 고친 시각을 적는다. 저장소가 막혀 못 적으면 false */
function writeStamp(at: number): boolean {
  try { sessionStorage.setItem(RELOAD_STAMP_KEY, String(at)); return true } catch { return false }
}

/** 브라우저에서 loadChunk가 쓰는 값들 (lazyScreen·lazyPart) */
export const browserChunkEnv: ChunkEnv = {
  online: () => navigator.onLine,
  fetchIndexHtml,
  // index.html에 적힌 그대로의 src를 읽는다 (.src는 주소 전체라 index.html의 글과 견줄 수 없다)
  currentEntry: () => document.querySelector('script[type="module"][src]')?.getAttribute('src') ?? null,
  readStamp,
  writeStamp,
  reload: () => window.location.reload(),
  now: () => Date.now(),
}

/**
 * 브라우저에서 prefetchLater가 쓰는 값들 (App의 기록 상세·도감).
 * 나중은 그냥 몇 초 뒤다 — requestIdleCallback은 아이폰 사파리에 없다. 받는 것은 이 사이트의 앱 파일뿐이라 보내는 값이 없다.
 */
export const browserPrefetchEnv: PrefetchEnv = {
  online: () => navigator.onLine,
  later: (run) => {
    const timer = setTimeout(run, PREFETCH_DELAY_MS)
    return () => clearTimeout(timer)
  },
}
