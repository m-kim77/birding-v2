import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Sighting } from '../types'
import { dbDelete, dbGet, dbGetAll, dbPut } from './db'
import { deletePhotos } from './photos'

/**
 * 백업 안 된 기록이 이 수 이상일 때만 첫 화면에 알림을 띄운다.
 * 한두 건마다 띄우면 첫 화면의 가장 좋은 자리를 늘 잔소리가 차지한다. 설정 화면에는 수와 무관하게 늘 보인다.
 */
export const BACKUP_NUDGE_AT = 5
const LAST_BACKUP_KEY = 'lastBackupAt'

interface Journal {
  /** 아직 DB에서 읽는 중이면 null */
  sightings: Sighting[] | null
  /** DB를 못 열었을 때의 안내 문구 */
  error: string
  add: (s: Sighting) => Promise<void>
  update: (id: string, patch: Partial<Sighting>) => Promise<void>
  remove: (id: string) => Promise<void>
  /** 백업을 불러온 뒤처럼 DB가 바깥에서 바뀌었을 때 다시 읽는다 */
  reload: () => Promise<void>
  /** 마지막 백업 뒤에 생기거나 고친 기록 수 */
  unsaved: number
  markBackedUp: () => Promise<void>
}

const Ctx = createContext<Journal | null>(null)

/**
 * 기록 저장소. 화면은 이 인터페이스만 본다 — 로컬 DB라는 사실을 모른다.
 * 쓰기는 DB에 먼저 하고 성공하면 화면 상태를 바꾼다. 실패하면 Error가 부른 쪽으로 올라간다 (저장 안 된 것을 된 것처럼 보이지 않는다).
 */
export function JournalProvider({ children }: { children: ReactNode }) {
  const [sightings, setSightings] = useState<Sighting[] | null>(null)
  const [lastBackupAt, setLastBackupAt] = useState('')
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    try {
      setSightings(await dbGetAll<Sighting>('sightings'))
      setLastBackupAt((await dbGet<string>('meta', LAST_BACKUP_KEY)) ?? '')
    } catch (e) {
      setError(e instanceof Error ? e.message : '기록 저장소를 열 수 없습니다.')
      setSightings([])
    }
  }, [])
  useEffect(() => { void reload() }, [reload])

  const journal = useMemo<Journal>(() => ({
    sightings, error, reload,
    unsaved: (sightings ?? []).filter((s) => s.updatedAt > lastBackupAt).length,
    add: async (s) => { await dbPut('sightings', s); setSightings((list) => [s, ...(list ?? [])]) },
    update: async (id, patch) => {
      const cur = (sightings ?? []).find((s) => s.id === id)
      if (!cur) return
      const next = { ...cur, ...patch, updatedAt: new Date().toISOString() }
      await dbPut('sightings', next)
      setSightings((list) => (list ?? []).map((s) => (s.id === id ? next : s)))
    },
    remove: async (id) => {
      await dbDelete('sightings', id)
      await deletePhotos(id)
      setSightings((list) => (list ?? []).filter((s) => s.id !== id))
    },
    markBackedUp: async () => {
      const now = new Date().toISOString()
      await dbPut('meta', now, LAST_BACKUP_KEY)
      setLastBackupAt(now)
    },
  }), [sightings, lastBackupAt, error, reload])

  return <Ctx.Provider value={journal}>{children}</Ctx.Provider>
}

/** 저장소를 꺼낸다. Provider 밖에서 부르면 Error (조용히 빈 값을 주면 원인을 찾기 어렵다) */
export function useJournal(): Journal {
  const journal = useContext(Ctx)
  if (!journal) throw new Error('useJournal: JournalProvider 밖에서 호출됨')
  return journal
}
