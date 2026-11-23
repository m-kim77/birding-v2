import Button from '../ui/Button'
import { leaveScreen } from './nav'

/**
 * 화면 조각을 받지 못했을 때 그 화면 자리에 보이는 안내 (App.tsx의 LoadBoundary). 앱의 다른 곳(아래 탭·쓰던 기록)은 그대로다.
 * 온라인이면 새 판이 나온 것으로 본다 — 저절로 한 번 새로 고쳤는데도 안 됐거나(chunkLoad.ts) 막 새로 고친 뒤다.
 * '다시 열기'는 새로고침이다 — 방문 기록의 칸은 그대로라 이 화면이 새 판으로 다시 열린다.
 * '뒤로'는 아이폰 홈 화면 앱처럼 뒤로가기 버튼이 없는 곳에서 빠져나갈 길이다 (기록하기·새소리에는 아래 탭도 없다).
 */
export default function ScreenLoadFailed() {
  const online = navigator.onLine
  return (
    <div className="screen screen-empty" role="alert">
      <h1>{online ? '새 판이 나왔습니다' : '화면을 받지 못했습니다'}</h1>
      <p>
        {online
          ? '지금 열린 앱으로는 이 화면을 받을 수 없습니다. 다시 열면 새 판으로 열립니다.'
          : '인터넷에 연결되지 않아 이 화면을 받지 못했습니다. 연결된 뒤 다시 열어 주세요.'}
        {' '}저장해 둔 기록과 사진은 그대로 있습니다.
      </p>
      <div className="row-actions">
        <Button variant="primary" onClick={() => window.location.reload()}>다시 열기</Button>
        <Button variant="quiet" onClick={leaveScreen}>뒤로</Button>
      </div>
    </div>
  )
}
