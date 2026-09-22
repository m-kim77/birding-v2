import { Suspense, lazy, useState } from 'react'
import AppShell from './app/AppShell'
import ErrorBoundary from './app/ErrorBoundary'
import { activeTab, type Route } from './app/routes'
import { JournalProvider } from './data/journal'
import DexScreen from './features/dex/DexScreen'
import RecordDetail from './features/records/RecordDetail'
import RecordsScreen from './features/records/RecordsScreen'
import { useTheme } from './theme/useTheme'

// 지도(Leaflet)와 기록하기(탐지 모델·EXIF)는 무겁다. 첫 화면(기록 목록)을 폰에서 빨리 띄우려고 필요할 때 받는다
const MapScreen = lazy(() => import('./features/map/MapScreen'))
const RecordFlow = lazy(() => import('./features/record/RecordFlow'))
// 설정은 백업(ZIP)과 모델 관리(탐지 모델)를 끌고 온다
const SettingsScreen = lazy(() => import('./features/settings/SettingsScreen'))

/**
 * 앱의 뿌리. 어느 화면을 보여 줄지만 정한다.
 * "+"는 곧바로 사진 기록으로 간다 — 소리로 기록하기가 들어오면 그 사이에 "사진으로 / 소리로" 선택이 생긴다.
 */
export default function App() {
  const [route, setRoute] = useState<Route>({ name: 'records' })
  const theme = useTheme()
  const openDetail = (id: string) => setRoute({ name: 'detail', id })
  const home = () => setRoute({ name: 'records' })
  const startRecord = () => setRoute({ name: 'record' })

  return (
    <div className="viewport">
      <ErrorBoundary>
      <JournalProvider>
        <AppShell active={activeTab(route)} onTab={(name) => setRoute({ name } as Route)} onAdd={startRecord} hideNav={route.name === 'record'}
          screenKey={route.name === 'detail' ? `detail:${route.id}` : route.name}>
          <Suspense fallback={<div className="screen"><p className="hint">불러오는 중…</p></div>}>
          {route.name === 'records' && <RecordsScreen onOpen={openDetail} onBackup={() => setRoute({ name: 'settings' })} onAdd={startRecord} />}
          {route.name === 'detail' && <RecordDetail key={route.id} id={route.id} onBack={home} />}
          {route.name === 'dex' && <DexScreen onOpenRecord={openDetail} />}
          {route.name === 'map' && <MapScreen onOpen={openDetail} />}
          {route.name === 'settings' && <SettingsScreen choice={theme.choice} onChoose={theme.choose} />}
          {route.name === 'record' && <RecordFlow onCancel={home} onDone={openDetail} />}
          </Suspense>
        </AppShell>
      </JournalProvider>
      </ErrorBoundary>
    </div>
  )
}
