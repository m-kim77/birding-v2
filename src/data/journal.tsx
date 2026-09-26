import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Sighting } from '../types'
import { dbGet, dbGetAll, dbPut } from './db'
import { deleteSightingWithPhotos, writeSightingWithPhotos, type PhotoFile } from './photos'

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
  /** 기록과 그 사진들을 한 번에 넣는다 (반쪽이 남지 않는다) */
  add: (s: Sighting, photos: PhotoFile[]) => Promise<void>
  update: (id: string, patch: Partial<Sighting>) => Promise<void>
  remove: (id: string) => Promise<void>
  /** 백업을 불러온 뒤처럼 DB가 바깥에서 바뀌었을 때 다시 읽는다 */
  reload: () => Promise<void>
  /** 마지막 백업 뒤에 생기거나 고친 기록 수 */
  unsaved: number
  /** 마지막으로 백업 파일을 만든 시각 (UTC ISO). 한 번도 안 했으면 빈 문자열 */
  lastBackupAt: string
  /**
   * 브라우저가 이 앱의 저장소를 "지우지 않겠다"고 약속했는지. 아직 모르거나 API가 없으면 null.
   * false면 저장 공간이 모자랄 때 기록이 통째로 지워질 수 있다 — 화면은 이 값을 보고 백업을 더 일찍 권한다.
   * (처음에는 묻기만 한 값이라 "아직 요청 안 함"도 false다. 첫 저장 뒤에 요청하고 그 답으로 갱신한다.)
   */
  persisted: boolean | null
  markBackedUp: () => Promise<void>
}

/**
 * 브라우저가 이 앱의 저장소를 지우지 않기로 했는지 **묻기만** 한다 (프롬프트 없음). API가 없으면 null.
 * 요청(`persist`)과 갈라 둔 이유: 파이어폭스는 요청을 사용자에게 권한 창으로 띄운다 — 첫 화면에서 그러면 안 된다.
 */
async function readPersisted(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persisted) return null
    return await navigator.storage.persisted()
  } catch {
    return null
  }
}

/**
 * 저장소를 지우지 말라고 요청한다. 거절되면 false, API가 없으면 null.
 * 크롬은 설치·즐겨찾기 같은 신호로 조용히 정하고, 아이폰 사파리는 홈 화면에 추가했을 때만 승인한다 — 그래서 거절이 흔하다.
 * 지킬 것이 생긴 순간(첫 기록 저장 직후)에 한 번만 부른다.
 */
async function requestPersist(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persist) return null
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

const Ctx = createContext<Journal | null>(null)

/**
 * 기록 저장소. 화면은 이 인터페이스만 본다 — 로컬 DB라는 사실을 모른다.
 * 쓰기는 DB에 먼저 하고 성공하면 화면 상태를 바꾼다. 실패하면 Error가 부른 쪽으로 올라간다 (저장 안 된 것을 된 것처럼 보이지 않는다).
 */
export function JournalProvider({ children }: { children: ReactNode }) {
  const [sightings, setSightings] = useState<Sighting[] | null>(null)
  const [lastBackupAt, setLastBackupAt] = useState('')
  const [persisted, setPersisted] = useState<boolean | null>(null)
  // 이번 실행에서 persist()를 이미 요청했는지 — 거절을 기억하지 않는 브라우저에서 저장할 때마다 다시 묻지 않게
  const askedPersist = useRef(false)
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
  useEffect(() => { void readPersisted().then(setPersisted) }, [])

  const journal = useMemo<Journal>(() => ({
    sightings, error, reload, lastBackupAt, persisted,
    unsaved: (sightings ?? []).filter((s) => s.updatedAt > lastBackupAt).length,
    add: async (s, photos) => {
      await writeSightingWithPhotos(s, photos)
      setSightings((list) => [s, ...(list ?? [])])
      // 지킬 것이 생겼다 — 지금 저장소 보존을 요청한다 (첫 화면에서 묻지 않는 이유는 requestPersist 주석)
      if (persisted !== true && !askedPersist.current) { askedPersist.current = true; void requestPersist().then((ok) => { if (ok !== null) setPersisted(ok) }) }
    },
    update: async (id, patch) => {
      const cur = (sightings ?? []).find((s) => s.id === id)
      if (!cur) return
      const next = { ...cur, ...patch, updatedAt: new Date().toISOString() }
      await dbPut('sightings', next)
      setSightings((list) => (list ?? []).map((s) => (s.id === id ? next : s)))
    },
    remove: async (id) => {
      await deleteSightingWithPhotos(id)
      setSightings((list) => (list ?? []).filter((s) => s.id !== id))
    },
    markBackedUp: async () => {
      const now = new Date().toISOString()
      await dbPut('meta', now, LAST_BACKUP_KEY)
      setLastBackupAt(now)
    },
  }), [sightings, lastBackupAt, persisted, error, reload])

  return <Ctx.Provider value={journal}>{children}</Ctx.Provider>
}

/** 저장소를 꺼낸다. Provider 밖에서 부르면 Error (조용히 빈 값을 주면 원인을 찾기 어렵다) */
export function useJournal(): Journal {
  const journal = useContext(Ctx)
  if (!journal) throw new Error('useJournal: JournalProvider 밖에서 호출됨')
  return journal
}
