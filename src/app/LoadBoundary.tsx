import { Component, type ErrorInfo, type ReactNode } from 'react'
import { ChunkLoadError } from './chunkLoad'

interface Props {
  children: ReactNode
  /** 조각을 받지 못했을 때 그 자리에 그릴 것. 받은 오류로 문구를 고른다 (새 판인지 — ChunkLoadError.newBuild) */
  fallback: (error: ChunkLoadError) => ReactNode
}

interface State {
  error: Error | null
}

/**
 * 화면 조각을 받지 못한 오류(ChunkLoadError — lazyScreen·lazyPart)만 받아, 앱 전체 대신 그 자리에 `fallback(오류)`을 그린다.
 * 다른 오류는 받지 않고 위로 다시 던진다 — 맨 위 ErrorBoundary가 지금처럼 '문제가 생겼습니다'를 띄운다.
 * 다른 화면으로 가면 풀려야 하므로 부르는 쪽이 화면마다 key를 바꿔 준다 (App.tsx).
 */
export default class LoadBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 오류 수집 서버는 없다. 사용자가 문의할 때 콘솔을 캡처해 줄 수 있게 브라우저가 준 이유를 남긴다
    if (error instanceof ChunkLoadError) console.error('화면 조각을 받지 못했습니다', error.reason, info.componentStack)
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    // 받지 못한 것이 아닌 오류는 여기서 그리지 않는다 — 그리다 던지면 위의 오류 경계로 간다
    if (!(error instanceof ChunkLoadError)) throw error
    return this.props.fallback(error)
  }
}
