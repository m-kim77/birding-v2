import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import { holdingReload, retryOnce } from './chunkLoad'

/**
 * 화면 하나를 필요할 때 받는다 (React.lazy). 실패하면 한 번 다시 받고, 그래도 안 되면 ChunkLoadError —
 * 그 화면 자리의 LoadBoundary가 안내를 띄운다 (앱 전체가 오류 화면이 되지 않는다).
 * React.lazy는 한 번 실패하면 앱을 다시 열 때까지 같은 실패를 낸다 — 그래서 안내는 '다시 열기'다.
 */
// React.lazy와 같은 모양 — 화면마다 props가 달라 any로 받는다
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyScreen<T extends ComponentType<any>>(load: () => Promise<{ default: T }>): LazyExoticComponent<T> {
  return lazy(() => retryOnce(load))
}

/**
 * 쓰던 것이 있는 화면 안의 조각(위치 시트)을 필요할 때 받는다 — lazyScreen과 같되, 받는 동안 저절로 새로 고치지 않는다
 * (새로 고치면 쓰던 이름·메모가 사라진다 — chunkLoad.ts holdingReload). 못 받으면 ChunkLoadError.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyPart<T extends ComponentType<any>>(load: () => Promise<{ default: T }>): LazyExoticComponent<T> {
  return lazy(() => holdingReload(() => retryOnce(load)))
}
