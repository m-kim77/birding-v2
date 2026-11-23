import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { listenForNewBuild } from './app/chunkLoad'
import { startNav } from './app/nav'
import { applyTokens, loadChoice, resolveTheme } from './theme/applyTheme'
import './styles/base.css'
import './styles/shell.css'
import './styles/ui.css'
import './styles/screens.css'

// 첫 그리기 전에 토큰을 넣는다 — 안 그러면 테마 없는 화면이 한 번 번쩍인다
applyTokens(document.documentElement, resolveTheme(loadChoice(), window.matchMedia('(prefers-color-scheme: dark)').matches).tokens)

// 저장소를 지우지 말라는 요청(navigator.storage.persist)은 data/journal.tsx가 한다 — 결과를 화면이 봐야 해서다

// 첫 그리기 전에 방문 기록의 지금 칸을 읽는다 — 새로고침한 거면 보던 화면으로 연다 (app/nav.ts)
startNav()

// 새로 배포한 뒤 열려 있던 앱이 옛 화면 조각을 못 받으면 한 번만 새로 고쳐 새 판으로 연다 (app/chunkLoad.ts)
listenForNewBuild()

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
