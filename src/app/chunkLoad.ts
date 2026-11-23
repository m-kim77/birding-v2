/**
 * 화면 조각(lazy import)을 받지 못했을 때의 규칙 — 한 번 다시 받아 보고, 새 판이 나온 것 같으면 한 번만 저절로 새로 고친다.
 * Vercel Hobby에는 옛 판 파일을 남겨 두는 기능(Skew Protection)이 없어, 새로 배포하면 열어 둔 앱이 아직 안 받은 화면의 옛 파일은 404다.
 * 이 파일은 값을 import하지 않는다 (node --test가 읽는다 — test/chunkLoad.test.ts). 브라우저 값(window·sessionStorage)은 함수 안에서만 읽는다.
 */

/** 화면 조각을 두 번 다 받지 못했다. 그 화면 자리의 오류 경계(LoadBoundary)가 이것만 받아 그 자리에 안내를 띄운다 */
export class ChunkLoadError extends Error {
  /** 두 번째 받기의 실패 (브라우저의 영어 문구 — 화면에는 보이지 않고 콘솔에만 남긴다) */
  readonly reason: unknown
  constructor(reason: unknown) {
    super('화면을 받지 못했습니다.')
    this.reason = reason
  }
}

/** 한 번 실패한 뒤 다시 받기 전에 기다리는 시간 — 잠깐 끊긴 신호가 돌아올 틈 */
export const RETRY_WAIT_MS = 800
/** 이 시간 안에 이미 저절로 새로 고쳤으면 다시 하지 않는다 — 새 판에서도 조각을 못 받으면 새로 고침이 끝없이 돈다 */
export const RELOAD_GUARD_MS = 5 * 60_000
const RELOAD_STAMP_KEY = 'bird-journal:new-build-reload-at'

/**
 * 조각을 받는다. 실패하면 `waitMs` 뒤에 **한 번만** 다시 받고, 그래도 실패하면 ChunkLoadError를 던진다.
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

let held = 0

/**
 * 쓰던 것이 있는 화면 안에서 조각을 받는 동안(사진 없이 기록·수정 칸의 위치 시트) 저절로 새로 고치지 않게 막는다 —
 * 새로 고치면 쓰던 이름·메모가 사라진다. 받기가 끝나면(성공·실패 모두) 푼다. `load`의 결과·오류를 그대로 돌려준다.
 */
export async function holdingReload<T>(load: () => Promise<T>): Promise<T> {
  held += 1
  try { return await load() } finally { held -= 1 }
}

/** 지금 저절로 새로 고침을 막고 있는지 (holdingReload가 받는 중) */
export function reloadHeld(): boolean {
  return held > 0
}

/** 지난번에 저절로 새로 고친 시각. 적힌 적이 없으면 null, 저장소가 막혔으면 'unknown', 깨진 값은 null로 본다 */
function readReloadStamp(): number | null | 'unknown' {
  try {
    const n = Number(sessionStorage.getItem(RELOAD_STAMP_KEY) ?? NaN)
    return Number.isFinite(n) ? n : null
  } catch {
    return 'unknown'
  }
}

/**
 * Vite가 조각을 받지 못할 때 보내는 'vite:preloadError'를 듣는다 (main.tsx, 그리기 전 한 번).
 * 받는 곳이 막고 있지 않고(holdingReload), 온라인이고, 5분 안에 저절로 새로 고친 적이 없으면 한 번 새로 고친다 —
 * 방문 기록의 칸은 그대로라 열려던 화면이 새 판으로 열린다 (app/nav.ts startNav). 시각을 적지 못하면 새로 고치지 않는다.
 * 새로 고치지 않을 때는 아무것도 하지 않는다 — 그 조각을 기다리던 화면이 오류를 받아 그 자리에 안내를 띄운다 (LoadBoundary).
 * 막지 않는다(preventDefault 없음) — 막으면 import가 빈 값으로 끝나 화면이 엉뚱한 오류로 깨진다.
 */
export function listenForNewBuild(): void {
  window.addEventListener('vite:preloadError', () => {
    if (reloadHeld() || !mayAutoReload(readReloadStamp(), Date.now(), navigator.onLine)) return
    try { sessionStorage.setItem(RELOAD_STAMP_KEY, String(Date.now())) } catch { return }
    window.location.reload()
  })
}
