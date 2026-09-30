import { Suspense, lazy } from 'react'
import AppShell from './app/AppShell'
import ErrorBoundary from './app/ErrorBoundary'
import { leaveScreen, openScreen, replaceScreen, switchTab } from './app/nav'
import { activeTab } from './app/routes'
import { useNavEntry } from './app/useNav'
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
// 새소리 듣기는 마이크·판정기를 끌고 온다
const SoundScreen = lazy(() => import('./features/sound/SoundScreen'))
// 사진 없이 기록은 새 기록 첫 화면에서만 들어간다 — 첫 화면(기록 목록)이 받을 이유가 없어 기록하기처럼 필요할 때 받는다
const QuickRecord = lazy(() => import('./features/record/QuickRecord'))

/**
 * 앱의 뿌리. 어느 화면을 보여 줄지만 정한다 — 지금 화면은 방문 기록의 지금 칸이다 (app/nav.ts). 그래서 폰의 뒤로가기가 앱 안에서 뒤로 간다.
 * 화면의 '뒤로'(onBack·onCancel)도 폰의 뒤로가기와 같은 곳으로 간다 (leaveScreen).
 * "+"는 곧바로 사진 기록으로 간다. 새소리 듣기와 사진 없이 기록은 그 첫 화면의 버튼으로 연다 (2026-09-27 — "사진으로 / 소리로" 시트를 두면 사진 기록이 매번 한 번 더 눌러야 한다).
 */
export default function App() {
  const { route } = useNavEntry()
  const theme = useTheme()
  const openDetail = (id: string) => openScreen({ name: 'detail', id })
  const startRecord = () => openScreen({ name: 'record' })
  const openSettings = () => openScreen({ name: 'settings' })
  const openSound = () => openScreen({ name: 'sound' })
  // 저장 직후 '완료': 기록하기 칸을 그 기록의 상세로 바꿔 끼운다 — 상세에서 뒤로가 빈 '새 기록'이 아니라 기록하기를 시작한 화면으로 가게
  const showSaved = (id: string) => replaceScreen({ name: 'detail', id })
  // 사진 없이 기록: 새 기록 첫 화면 칸을 바꿔 끼운다 — 쌓으면 저장 뒤 상세에서 뒤로 갈 때 빈 '새 기록'이 나온다. 뒤로는 기록하기를 시작한 화면으로
  const openQuick = () => replaceScreen({ name: 'quick' })

  return (
    <div className="viewport">
      <ErrorBoundary>
      <JournalProvider>
        <AppShell active={activeTab(route)} onTab={switchTab} onAdd={startRecord} hideNav={route.name === 'record' || route.name === 'sound' || route.name === 'quick'}
          screenKey={route.name === 'detail' ? `detail:${route.id}` : route.name}>
          <Suspense fallback={<div className="screen"><p className="hint">불러오는 중…</p></div>}>
          {route.name === 'records' && <RecordsScreen onOpen={openDetail} onBackup={openSettings} onAdd={startRecord} onSettings={openSettings} />}
          {route.name === 'detail' && <RecordDetail key={route.id} id={route.id} onBack={leaveScreen} onOpenSettings={openSettings} />}
          {route.name === 'dex' && <DexScreen onOpenRecord={openDetail} />}
          {route.name === 'map' && <MapScreen onOpen={openDetail} />}
          {route.name === 'settings' && <SettingsScreen choice={theme.choice} onChoose={theme.choose} onOpenRecord={openDetail} />}
          {route.name === 'record' && <RecordFlow onCancel={leaveScreen} onDone={showSaved} onOpenSettings={openSettings} onOpenSound={openSound} onOpenQuick={openQuick} />}
          {route.name === 'quick' && <QuickRecord onCancel={leaveScreen} onDone={showSaved} />}
          {route.name === 'sound' && <SoundScreen onBack={leaveScreen} />}
          </Suspense>
        </AppShell>
      </JournalProvider>
      </ErrorBoundary>
    </div>
  )
}
