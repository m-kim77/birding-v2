import { useCallback, useEffect, useRef, useState } from 'react'
import { useJournal } from '../../data/journal'
import { readPhotoCheck, type PhotoCheck } from '../../data/photoCheck'
import type { UsageEstimate } from './storageText'

/** 저장 공간 카드가 떠 있는 동안 "공간이 바뀌었다"를 들을 곳 */
const listeners = new Set<() => void>()

/**
 * 설정 화면에서 기기 공간을 바꾼 카드(받은 모델 받기·지우기, 이동 기록 넣기·지우기)가 부른다 — 저장 공간 카드가 쓰는 양을 다시 잰다.
 * 카드끼리 props로 잇지 않으려고 둔 작은 신호다. 듣는 카드가 없으면 아무 일도 없다.
 */
export function notifyStorageChanged(): void {
  for (const listener of listeners) listener()
}

/** 브라우저에 쓰는 양·한도를 묻는다. API가 없거나(사파리 17 전) 실패하면 null — 편의 정보라 던지지 않는다 */
async function readEstimate(): Promise<UsageEstimate | null> {
  try {
    if (!navigator.storage?.estimate) return null
    const e = await navigator.storage.estimate()
    return { usage: typeof e.usage === 'number' ? e.usage : null, quota: typeof e.quota === 'number' ? e.quota : null }
  } catch {
    return null
  }
}

export interface StorageStatus {
  /** undefined: 재는 중 · null: 브라우저가 알려 주지 않음 */
  estimate: UsageEstimate | null | undefined
  /** undefined: 점검 중 · null: 점검하지 못함 (DB를 못 엶) */
  check: PhotoCheck | null | undefined
  /** 이 카드가 공간을 바꾼 뒤(정리) 둘 다 다시 읽는다 */
  refresh: () => Promise<void>
}

/**
 * 저장 공간 카드의 상태: 쓰는 양(브라우저의 어림값)과 사진 점검. 설정의 StorageSection이 쓴다.
 * - 처음과, 기록이 바뀔 때(백업 불러오기 등) 둘 다 다시 읽는다.
 * - 같은 화면의 다른 카드가 공간을 바꾸면(`notifyStorageChanged`) 쓰는 양만 다시 잰다 — 사진 점검과는 상관없는 변화다.
 * 늦게 도착한 옛 결과가 새 결과를 덮지 않게 둘을 따로 순번 매긴다 (쓰는 양을 다시 재도 진행 중인 점검은 버리지 않는다).
 */
export function useStorageStatus(): StorageStatus {
  const { sightings } = useJournal()
  const [estimate, setEstimate] = useState<UsageEstimate | null | undefined>(undefined)
  const [check, setCheck] = useState<PhotoCheck | null | undefined>(undefined)
  const estimateSeq = useRef(0)
  const checkSeq = useRef(0)

  const measure = useCallback(async () => {
    const mine = ++estimateSeq.current
    const next = await readEstimate()
    if (mine === estimateSeq.current) setEstimate(next)
  }, [])

  const recheck = useCallback(async () => {
    const mine = ++checkSeq.current
    const next = await readPhotoCheck().catch(() => null)
    if (mine === checkSeq.current) setCheck(next)
  }, [])

  const refresh = useCallback(async () => { await Promise.all([measure(), recheck()]) }, [measure, recheck])

  useEffect(() => { void refresh() }, [refresh, sightings])

  useEffect(() => {
    const listener = () => { void measure() }
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }, [measure])

  return { estimate, check, refresh }
}
