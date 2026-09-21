import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { applyTokens, loadChoice, resolveTheme } from './theme/applyTheme'
import './styles/base.css'
import './styles/shell.css'
import './styles/ui.css'
import './styles/screens.css'

// 첫 그리기 전에 토큰을 넣는다 — 안 그러면 테마 없는 화면이 한 번 번쩍인다
applyTokens(document.documentElement, resolveTheme(loadChoice(), window.matchMedia('(prefers-color-scheme: dark)').matches).tokens)

// 브라우저가 저장 공간이 모자랄 때 이 앱의 기록을 마음대로 지우지 않게 해 달라고 요청한다 (거절돼도 앱은 돈다)
void navigator.storage?.persist?.()

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
