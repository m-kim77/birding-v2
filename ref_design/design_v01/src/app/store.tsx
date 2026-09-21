import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { SIGHTINGS } from '../mock/data'
import type { Scenario, Sighting } from '../types'

interface Store {
  sightings: Sighting[]
  /** 새 기록을 맨 앞에 더한다 */
  add: (s: Sighting) => void
  update: (id: string, patch: Partial<Sighting>) => void
  remove: (id: string) => void
  /** 마지막 백업 뒤에 생긴 기록 수. 0이면 백업 알림을 띄우지 않는다 */
  unsaved: number
  markBackedUp: () => void
  /** 초안 보기 도구가 고른 상황 (제품에는 없다) */
  scenario: Scenario
}

const Ctx = createContext<Store | null>(null)

/**
 * 기록 저장소. 초안이라 메모리에만 들고 새로고침하면 처음으로 돌아간다.
 * 제품에서는 이 자리에 브라우저 로컬 DB가 온다 — 화면은 이 인터페이스만 본다.
 */
export function StoreProvider({ scenario, children }: { scenario: Scenario; children: ReactNode }) {
  const [sightings, setSightings] = useState<Sighting[]>(SIGHTINGS)
  const [unsaved, setUnsaved] = useState(3)

  const store = useMemo<Store>(() => ({
    sightings, unsaved, scenario,
    add: (s) => { setSightings((list) => [s, ...list]); setUnsaved((n) => n + 1) },
    update: (id, patch) => setSightings((list) => list.map((s) => (s.id === id ? { ...s, ...patch } : s))),
    remove: (id) => setSightings((list) => list.filter((s) => s.id !== id)),
    markBackedUp: () => setUnsaved(0),
  }), [sightings, unsaved, scenario])

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>
}

/** 저장소를 꺼낸다. Provider 밖에서 부르면 Error (조용히 빈 값을 주면 원인을 찾기 어렵다) */
export function useStore(): Store {
  const store = useContext(Ctx)
  if (!store) throw new Error('useStore: StoreProvider 밖에서 호출됨')
  return store
}
