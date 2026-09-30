import { useEffect, useState } from 'react'
import type { Draft } from '../../data/draft'
import type { NormalizedBox, Verdict } from '../../types'
import type { AskState } from './useAsk'
import { useDraft } from './useDraft'
import type { PickedPhoto } from './usePhotoPick'
import type { PlaceValue } from './usePlace'

/** 고른 영역과 그것을 고른 쪽 (탐지 모델 id 또는 'manual') */
export type Crop = { box: NormalizedBox; by: string }

/** 초안 배선이 읽고 부르는 다른 훅들의 몫 */
interface Deps {
  /** 사진 고르기 (usePhotoPick) */
  picker: { photo: PickedPhoto | null; pick: (f: File) => Promise<PickedPhoto | null> }
  /** 위치 (useRecordPlace의 loc) — 초안에 남기고, 되살릴 때 넣는다 */
  loc: { place: PlaceValue; copyFrom: (p: PlaceValue) => void }
  /** AI 판정 (useAsk) — 끝난 판정만 초안에 남긴다 */
  ask: { state: AskState; verdict: Verdict | null; restore: (v: Verdict) => void; cancel: () => void }
  /** 저장을 마쳤는지. 마친 뒤에는 초안을 쓰지 않는다 */
  saved: boolean
}

/**
 * 기록 화면에서 사용자가 쓰는 값(영역·이름·개체 수·메모·판정을 보낸 영역)과 초안 배선 — 되살리기·자동 저장·사진 고르기.
 * 모두 `data/draft.ts`의 초안 칸과 같이 바뀐다: 초안에 칸을 더하면 이 파일의 상태·되살리기·자동 저장 세 곳을 함께 고친다.
 * **useRecordPlace 뒤에 부른다** — 같은 커밋의 effect는 훅을 부른 순서대로 돈다. 앞에 부르면 usePlace의 EXIF effect가 되살린 위치를 덮는다.
 * 초안 저장 실패는 삼킨다 (useDraft) — 기록 작성을 막지 않는다.
 */
export function useRecordFields({ picker, loc, ask, saved }: Deps) {
  const photo = picker.photo
  const draft = useDraft()
  const [crop, setCrop] = useState<Crop | null>(null)
  const [name, setName] = useState('')
  // 개체 수 칸의 글자 그대로 — 숫자로 읽는 것은 저장할 때 (lib/count.ts parseCount). 비우면 세지 않은 것
  const [count, setCount] = useState('')
  const [note, setNote] = useState('')
  // 판정을 보낼 때의 영역. 그 뒤 영역이 바뀌면 "다시 물어볼 수 있습니다"를 보여 준다
  const [askedBox, setAskedBox] = useState<NormalizedBox | null>(null)
  // 되살리는 중인 초안. 사진이 열린 뒤에 나머지 값을 채운다 (아래 effect)
  const [restoring, setRestoring] = useState<Draft | null>(null)

  /**
   * 초안의 나머지 값을 채운다 — 사진이 열린 **다음 렌더**에서. usePlace의 EXIF effect가 먼저 돌고 나서 초안의 위치를 덮어야
   * (같은 커밋에서 훅 선언 순서대로 effect가 돈다) 직접 고른 위치가 사진 좌표에 밀리지 않는다.
   */
  useEffect(() => {
    if (!restoring || photo?.file !== restoring.file) return
    setCrop(restoring.crop)
    setName(restoring.name)
    // 개체 수 칸이 생기기 전의 초안에는 없다 — 빈칸(세지 않음)으로
    setCount(typeof restoring.count === 'string' ? restoring.count : '')
    setNote(restoring.note)
    setAskedBox(restoring.askedBox)
    // 사진에서 읽은 위치는 방금 다시 읽었다. 사용자가 고른 것과 지난번에 이동 기록으로 찾은 것('tracklog')을 되살린다 — 뒤늦게 끝난 매칭은 이것을 덮지 않는다 (fillIfEmpty)
    if (restoring.place.source !== 'exif' && restoring.place.source !== 'none') loc.copyFrom(restoring.place)
    if (restoring.verdict) ask.restore(restoring.verdict)
    setRestoring(null)
  }, [photo, restoring]) // eslint-disable-line react-hooks/exhaustive-deps

  // 값이 바뀔 때마다 초안을 (0.5초 모아서) 덮어쓴다. 사진이 없으면 남길 것이 없다. 되살리는 중에는 반쪽 값을 쓰지 않는다
  useEffect(() => {
    if (!photo || restoring || saved) return
    draft.persist({ crop, name, count, note, place: loc.place, verdict: ask.state === 'done' ? ask.verdict : null, askedBox })
  }, [photo, crop, name, count, note, loc.place, ask.state, ask.verdict, askedBox, restoring, saved]) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * 사진을 고르거나 바꾼다. **열기에 성공한 뒤에만** 이전 사진에 딸린 영역·판정을 비운다 — 실패하면 옛 사진이 그대로 남으므로 그것들도 남아야 한다.
   * 이름·개체 수·메모는 사용자가 적은 것이라 남기고, 지도에서 직접 고른 위치도 남는다 (usePlace).
   */
  async function choose(f: File) {
    if (await picker.pick(f)) { setCrop(null); setAskedBox(null); ask.cancel(); draft.persistPhoto(f) }
  }
  /** 초안을 되살린다. 사진부터 열고, 나머지는 위 effect가 채운다. 사진을 못 열면(파일이 깨졌으면) 초안을 버린다 */
  async function resume() {
    const d = draft.take()
    if (!d) return
    setRestoring(d)
    if (!(await picker.pick(d.file))) { setRestoring(null); void draft.clear() }
  }

  return { draft, crop, setCrop, name, setName, count, setCount, note, setNote, askedBox, setAskedBox, choose, resume }
}
