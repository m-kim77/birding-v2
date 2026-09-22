import { Component, type ErrorInfo, type ReactNode } from 'react'
import Button from '../ui/Button'

interface State {
  error: Error | null
}

/**
 * 그리다가 난 예외를 받아 백지 대신 안내를 보여 준다. React에서 이 일은 클래스 컴포넌트만 할 수 있다.
 * 기록은 IndexedDB에 있어서 화면이 죽어도 남아 있다 — 그 사실을 먼저 말한다. "다시 열기"는 새로고침이다 (상태를 되살릴 방법이 마땅치 않다).
 */
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 오류 수집 서버는 없다. 콘솔에 남겨 두면 사용자가 문의할 때 캡처해 줄 수 있다
    console.error('화면 오류', error, info.componentStack)
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div className="screen screen-empty" role="alert">
        <h1>문제가 생겼습니다</h1>
        <p>저장해 둔 기록과 사진은 남아 있습니다. 앱을 다시 열어 주세요.</p>
        <p className="hint">{this.state.error.message}</p>
        <Button variant="primary" onClick={() => window.location.reload()}>다시 열기</Button>
      </div>
    )
  }
}
