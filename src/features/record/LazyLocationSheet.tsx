import { Suspense, type ComponentProps } from 'react'
import LoadBoundary from '../../app/LoadBoundary'
import { lazyPart } from '../../app/lazyScreen'
import Sheet from '../../ui/Sheet'

// 위치 시트는 지도(Leaflet)를 끌고 온다 — 위치 줄을 누를 때 받는다 (위치를 안 고르는 사람까지 지도를 받지 않게).
// lazyPart: 받는 동안 저절로 새로 고치지 않는다 — 이 시트를 여는 곳(사진 없이 기록·수정 칸)은 초안이 없어 쓰던 값이 사라진다
const LocationSheet = lazyPart(() => import('./LocationSheet'))

/**
 * 위치 시트를 필요할 때 받아 연다. 사진 없이 기록(QuickRecord)과 기록 수정 칸(RecordEdit)이 쓴다 — 기록하기(RecordFlow)는 시트를 바로 불러 둔다.
 * 받는 동안은 아무것도 그리지 않는다 — 대신 시트를 잠깐 그리면 시트가 둘 열렸다 닫힌 셈이라 뒤로가기 칸이 하나 헛칸으로 남는다 (app/nav.ts openLayer).
 * 받지 못하면(새 판이 나왔거나 인터넷이 끊김) 시트 자리에 안내 시트를 연다 — 앱 전체가 오류 화면이 되지 않아 쓰던 값이 남는다.
 * 한 번 못 받으면 앱을 다시 열 때까지 다시 열어도 같은 안내다 (React.lazy가 실패를 기억한다).
 */
export default function LazyLocationSheet(props: ComponentProps<typeof LocationSheet>) {
  const online = navigator.onLine
  const failed = (
    <Sheet title="위치 고치기" onClose={props.onClose}>
      <p>
        {online ? '새 판이 나와서 지금 열린 앱으로는 위치 고르기를 받을 수 없습니다.' : '인터넷에 연결되지 않아 위치 고르기를 받지 못했습니다.'}
        {' '}적던 것은 그대로 있습니다 — 먼저 저장해 두고 앱을 다시 연 뒤, 기록의 '수정'에서 위치를 넣어 주세요.
      </p>
    </Sheet>
  )
  return (
    <LoadBoundary fallback={failed}>
      <Suspense fallback={null}>
        <LocationSheet {...props} />
      </Suspense>
    </LoadBoundary>
  )
}
