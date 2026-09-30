import { useState } from 'react'
import type { PhotoFile } from '../../data/photos'
import type { Sighting, Verdict } from '../../types'
import { accentFromImage } from '../dex/accentFromPhoto'
import { styleFromAccent } from '../dex/cardStyle'
import { isFirstMeet } from '../dex/dexNo'
import { buildSighting } from './buildSighting'
import { makeCrop, makePhotos } from './savePhotos'
import type { PickedPhoto } from './usePhotoPick'
import type { PlaceValue } from './usePlace'
import type { Crop } from './useRecordFields'

/** 저장할 때 읽는 화면의 값 — '저장'을 누른 그 순간의 것 */
export interface PhotoRecordInput {
  photo: PickedPhoto
  /** 쓸 영역 (고른 것, 없으면 새가 한 마리일 때의 그 상자). 없으면 null — 사진 전체 */
  picked: Crop | null
  name: string
  note: string
  place: PlaceValue
  verdict: Verdict | null
}

/** 저장을 마친 기록과, 그 기록이 처음 본 종인지 (카드 화면이 쓴다) */
export interface SavedRecord {
  sighting: Sighting
  firstMeet: boolean
}

/**
 * 사진 기록의 저장 — 기록 만들기·쓰기와 그 진행 상태(저장 중·실패 이유·마친 기록). RecordFlow가 쓴다.
 * `saved`는 초안 배선(useRecordFields)이 읽으므로 이 훅을 그보다 **먼저** 부르고, 초안을 비우는 함수는 저장할 때 넘겨받는다.
 * `add`는 기록과 사진을 한 번에 쓰는 저장소 함수(journal.add), `existing`은 더하기 전의 기록 목록이다.
 */
export function useSaveRecord(add: (s: Sighting, photos: PhotoFile[]) => Promise<void>, existing: Sighting[]) {
  const [saved, setSaved] = useState<SavedRecord | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  /**
   * 사진과 기록을 저장하고 카드 화면으로 넘어간다. 실패하면 이유를 보여 주고 화면에 머문다 (초안도 남는다).
   * 카드 색은 잘라낸 사진(없으면 사진 전체)에서 뽑는다 — 못 뽑으면 기본색. "처음 본 종"은 더하기 전의 목록으로 판단한다.
   */
  async function save({ photo, picked, name, note, place, verdict }: PhotoRecordInput, clearDraft: () => Promise<void>) {
    setSaving(true)
    setError('')
    try {
      const cut = picked ? await makeCrop(photo, picked.box) : null
      // 자른 영역이 없으면(모델을 안 받았거나 새를 못 찾았거나 여러 마리 중 안 골랐으면) 사진 전체에서 뽑는다 — imageForAI·getBestPhoto와 같은 규칙
      const cardStyle = styleFromAccent(await accentFromImage(cut?.blob ?? photo.bitmap))
      const sighting = buildSighting({ name, note, exif: photo.exif, place, crop: cut && picked ? { box: cut.box, by: picked.by } : null, verdict, cardStyle, now: new Date() })
      // 사진을 다 만든 뒤 기록과 함께 한 번에 쓴다 — 끊겨도 반쪽(사진만·기록만)이 남지 않는다
      await add(sighting, await makePhotos(photo, cut?.blob ?? null))
      setSaved({ sighting, firstMeet: isFirstMeet(sighting.speciesKo, existing) })
      // 기록이 됐으니 초안은 할 일을 다했다. 실패한 저장은 초안을 남긴다
      void clearDraft()
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return { saved, saving, error, save }
}
