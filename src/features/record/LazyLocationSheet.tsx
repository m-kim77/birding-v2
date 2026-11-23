import { Suspense, useEffect, type ComponentProps } from 'react'
import { browserPrefetchEnv } from '../../app/chunkEnv'
import LoadBoundary from '../../app/LoadBoundary'
import { lazyPart } from '../../app/lazyScreen'
import { prefetchLater } from '../../app/prefetch'
import Sheet from '../../ui/Sheet'

// 위치 시트는 지도(Leaflet)를 끌고 온다 — 첫 화면이 지도를 기다리지 않게 따로 받는다 (기록하기는 화면이 뜬 뒤 미리 받는다 — usePrefetchLocationSheet).
// lazyPart: 새 판이어도 저절로 새로 고치지 않는다 — 이 시트를 여는 곳 중 사진 없이 기록·수정 칸은 초안이 없어 쓰던 값이 사라지고, 기록하기도 '이어 쓰기'를 눌러야 돌아온다
const loadLocationSheet = () => import('./LocationSheet')
const LocationSheet = lazyPart(loadLocationSheet)

/**
 * 현장에서 기록하는 화면(기록하기·사진 없이 기록)이 뜨고 조금 뒤, 온라인이면 위치 시트를 미리 받아 둔다 (app/prefetch.ts).
 * 시트를 열 때만 받으면, 신호 있는 곳에서 GPS가 든 사진으로만 기록해 본 뒤 신호 없는 산에서 위치 없는 사진을 고르면
 * 지도가 필요 없는 '현재 위치로'·'직전 기록 위치로'까지 함께 못 쓴다. 그때 오프라인이거나 못 받으면 시트를 열 때 지금처럼 받는다.
 */
export function usePrefetchLocationSheet(): void {
  useEffect(() => prefetchLater([loadLocationSheet], browserPrefetchEnv), [])
}

/**
 * 위치 시트를 필요할 때 받아 연다. 기록하기(RecordFlow)·사진 없이 기록(QuickRecord)·기록 수정 칸(RecordEdit)이 쓴다.
 * 받는 동안은 아무것도 그리지 않는다 — 대신 시트를 잠깐 그리면 시트가 둘 열렸다 닫힌 셈이라 뒤로가기 칸이 하나 헛칸으로 남는다 (app/nav.ts openLayer).
 * 받지 못하면(새 판이 나왔거나 인터넷이 끊기거나 약함 — ChunkLoadError.newBuild로 가른다) 시트 자리에 안내 시트를 연다 — 앱 전체가 오류 화면이 되지 않아 쓰던 값이 남는다.
 * 한 번 못 받으면 앱을 다시 열 때까지 다시 열어도 같은 안내다 (React.lazy가 실패를 기억한다).
 */
export default function LazyLocationSheet(props: ComponentProps<typeof LocationSheet>) {
  const failed = (newBuild: boolean) => (
    <Sheet title="위치 고치기" onClose={props.onClose}>
      <p>
        {newBuild ? '새 판이 나와서 지금 열린 앱으로는 위치 고르기를 받을 수 없습니다.' : '인터넷 연결이 끊겼거나 약해서 위치 고르기를 받지 못했습니다.'}
        {' '}적던 것은 그대로 있습니다 — 먼저 저장해 두고 앱을 다시 연 뒤, 기록의 '수정'에서 위치를 넣어 주세요.
      </p>
    </Sheet>
  )
  return (
    <LoadBoundary fallback={(e) => failed(e.newBuild)}>
      <Suspense fallback={null}>
        <LocationSheet {...props} />
      </Suspense>
    </LoadBoundary>
  )
}
