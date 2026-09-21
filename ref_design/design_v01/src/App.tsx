import { useState } from 'react'
import AddSheet from './app/AddSheet'
import AppShell from './app/AppShell'
import PreviewStage, { type Device } from './app/PreviewStage'
import { activeTab, type Route } from './app/routes'
import { StoreProvider } from './app/store'
import DexScreen from './features/dex/DexScreen'
import MapScreen from './features/map/MapScreen'
import RecordFlow from './features/record/RecordFlow'
import RecordDetail from './features/records/RecordDetail'
import RecordsScreen from './features/records/RecordsScreen'
import SettingsScreen from './features/settings/SettingsScreen'
import SoundScreen from './features/sound/SoundScreen'
import { useTheme } from './theme/useTheme'
import type { Scenario } from './types'

/**
 * 초안의 뿌리. 화면 전환 상태와 초안 보기 도구의 상태(폰/PC, 상황)를 든다.
 * 상황을 바꾸면 StoreProvider를 새로 만들어 기록하기 흐름이 처음부터 다시 시작된다 (key).
 */
export default function App() {
  const [route, setRoute] = useState<Route>({ name: 'records' })
  const [adding, setAdding] = useState(false)
  const [device, setDevice] = useState<Device>('phone')
  const [scenario, setScenario] = useState<Scenario>('normal')
  const [forceDark, setForceDark] = useState(false)
  const theme = useTheme(forceDark ? true : null)

  /** "+"에서 고른 흐름으로 간다 */
  function start(name: 'record' | 'sound') {
    setAdding(false)
    // name이 합집합이라 객체 리터럴만으로는 Route의 한 갈래로 좁혀지지 않는다
    setRoute({ name } as Route)
  }
  const openDetail = (id: string) => setRoute({ name: 'detail', id })
  const home = () => setRoute({ name: 'records' })
  const focused = route.name === 'record' || route.name === 'sound'

  return (
    <PreviewStage device={device} onDevice={setDevice} scenario={scenario} onScenario={(s) => { setScenario(s); home() }}
      forceDark={forceDark} onForceDark={setForceDark}>
      <StoreProvider key={scenario} scenario={scenario}>
        <AppShell active={activeTab(route)} onTab={(name) => setRoute({ name } as Route)} onAdd={() => setAdding(true)} hideNav={focused}
          screenKey={route.name === 'detail' ? `detail:${route.id}` : route.name}>
          {route.name === 'records' && <RecordsScreen onOpen={openDetail} onBackup={() => setRoute({ name: 'settings' })} onAdd={() => setAdding(true)} />}
          {route.name === 'detail' && <RecordDetail key={route.id} id={route.id} onBack={home} />}
          {route.name === 'dex' && <DexScreen onOpenRecord={openDetail} />}
          {route.name === 'map' && <MapScreen onOpen={openDetail} />}
          {route.name === 'settings' && <SettingsScreen choice={theme.choice} onChoose={theme.choose} />}
          {route.name === 'record' && <RecordFlow onCancel={home} onDone={openDetail} />}
          {route.name === 'sound' && <SoundScreen onCancel={home} onDone={home} />}
          {adding && <AddSheet onClose={() => setAdding(false)} onPhoto={() => start('record')} onSound={() => start('sound')} />}
        </AppShell>
      </StoreProvider>
    </PreviewStage>
  )
}
