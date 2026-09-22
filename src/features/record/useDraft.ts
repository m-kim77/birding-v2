import { useCallback, useEffect, useRef, useState } from 'react'
import { clearDraft, loadDraft, saveDraftFields, saveDraftPhoto, type Draft, type DraftFields } from '../../data/draft'

/** 화면이 넘겨주는 초안의 작은 값들 (저장 시각·판은 저장소가 붙인다) */
export type DraftInput = Omit<DraftFields, 'v' | 'savedAt'>

/** 값이 바뀐 뒤 이만큼 조용하면 쓴다 — 글자마다 DB에 쓰지 않으려고 */
const SETTLE_MS = 500

/** 초안 저장 실패는 기록 작성을 막지 않는다 — 콘솔에만 남긴다 (용량 초과·사생활 보호 모드 등) */
function warn(e: unknown): void {
  console.warn('초안을 저장하지 못했습니다:', e)
}

/**
 * 쓰던 기록의 되살리기와 자동 저장.
 * - 처음 열 때 7일 안쪽의 초안이 있으면 `pending`에 든다. 화면이 "이어 쓰기 / 버리기"를 묻는다.
 * - `persist`는 0.5초 모아서 쓴다. 화면을 떠날 때 모아 둔 것이 있으면 바로 쓴다 (뒤로 가기 직후의 마지막 글자도 남게).
 * - `clear`는 모아 둔 것을 버리고 저장소도 비운다 — 저장에 성공했거나 사용자가 버렸을 때.
 * 저장 실패는 삼킨다. 편의 기능이다.
 */
export function useDraft() {
  const [pending, setPending] = useState<Draft | null>(null)
  // 저장소를 다 읽었는지 — 읽기 전에는 "초안 없음"이 아니라 "아직 모름"이다
  const [checked, setChecked] = useState(false)
  const timer = useRef<number | null>(null)
  const latest = useRef<DraftInput | null>(null)

  useEffect(() => {
    let alive = true
    void loadDraft().then((d) => { if (alive) { setPending(d); setChecked(true) } })
    return () => { alive = false }
  }, [])

  /** 모아 둔 값을 지금 쓴다 */
  const flush = useCallback(() => {
    if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null }
    if (latest.current) saveDraftFields(latest.current).catch(warn)
  }, [])

  /** 값이 바뀌었다 — 잠시 뒤에 쓴다 */
  const persist = useCallback((fields: DraftInput) => {
    latest.current = fields
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(flush, SETTLE_MS)
  }, [flush])

  /** 사진을 골랐다 — 파일은 그때 한 번만 쓴다 */
  const persistPhoto = useCallback((file: File) => { saveDraftPhoto(file).catch(warn) }, [])

  /** 초안을 버린다 (저장소와 모아 둔 것 모두) */
  const clear = useCallback(async () => {
    if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null }
    latest.current = null
    setPending(null)
    await clearDraft().catch(warn)
  }, [])

  /** 되살릴 초안을 꺼내고 `pending`을 비운다. 화면이 값을 채우는 데 쓴다 */
  const take = useCallback((): Draft | null => { const d = pending; setPending(null); return d }, [pending])

  // 화면을 떠날 때 마지막 변경이 아직 안 써졌으면 지금 쓴다
  useEffect(() => () => { if (timer.current !== null) flush() }, [flush])

  return { pending, checked, persist, persistPhoto, clear, take }
}
