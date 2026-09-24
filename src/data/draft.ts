/**
 * 쓰던 기록(초안)의 저장소. 사진으로 기록하다가 뒤로 가거나 앱이 죽어도 이어 쓸 수 있게 브라우저 DB `meta` 저장소에 둔다.
 *
 * 두 칸으로 나눈 이유: 사진 파일은 수십 MB라 글자 하나 고칠 때마다 다시 쓰면 안 된다.
 * - `draft`: 작은 값들(영역·이름·메모·위치·끝난 판정·저장 시각) — 바뀔 때마다 덮어쓴다
 * - `draftPhoto`: 고른 사진 파일 — 사진을 고를 때만 쓴다
 * 둘 중 하나라도 없거나 모양이 틀리면 초안이 없는 것으로 본다 (반쪽짜리 초안을 되살리지 않는다).
 *
 * 편의 기능이다 — 여기서 나는 오류는 기록 작성을 막지 않는다 (부르는 쪽이 삼킨다).
 */
import type { LocationSource, NormalizedBox, Verdict } from '../types'
// 확장자를 적는 이유: node --test가 이 파일을 직접 읽는다 (Vite는 어느 쪽이든 된다)
import { dbDelete, dbGet, dbPut } from './db.ts'

/** 이보다 오래된 초안은 되살리지 않는다 — 일주일 전에 고르다 만 사진을 "쓰던 기록"이라고 내밀면 방해다 */
export const DRAFT_MAX_AGE_MS = 7 * 86_400_000
const FIELDS_KEY = 'draft'
const PHOTO_KEY = 'draftPhoto'

/** 초안에 남기는 위치. `features/record/usePlace.ts`의 PlaceValue와 같은 모양 (저장소가 화면 쪽 타입을 모르게 따로 적는다) */
export interface DraftPlace {
  lat: number | null
  lng: number | null
  name: string
  source: LocationSource
}

/** 초안의 작은 값들. 가산 확장만 한다 — 옛 초안이 열려야 한다 */
export interface DraftFields {
  v: 1
  crop: { box: NormalizedBox; by: string } | null
  name: string
  note: string
  place: DraftPlace
  /** 끝난 판정만. 돌고 있던 판정은 화면을 떠나면 중단된다 */
  verdict: Verdict | null
  /** 판정을 보낼 때의 영역 — 되살린 뒤 영역이 바뀌었는지 보려고 */
  askedBox: NormalizedBox | null
  /** UTC ISO. 만료 판단과 "어제 오후 3:20" 표시에 쓴다 */
  savedAt: string
}

/** 되살린 초안. 사진 파일까지 갖춘 것만 이 모양이 된다 */
export interface Draft extends DraftFields {
  file: File
}

interface StoredPhoto {
  blob: Blob
  name: string
  type: string
  lastModified: number
}

/**
 * 초안이 너무 오래됐는지. 저장 시각을 못 읽으면 오래된 것으로 친다 (되살리지 않는다).
 * 미래 시각(기기 시계가 뒤로 간 경우)은 오래되지 않은 것으로 둔다.
 */
export function isDraftStale(savedAt: string, now = new Date()): boolean {
  const t = Date.parse(savedAt)
  if (Number.isNaN(t)) return true
  return now.getTime() - t > DRAFT_MAX_AGE_MS
}

/** 정규화 상자 모양인지 */
function isBox(v: unknown): v is NormalizedBox {
  const b = v as Record<string, unknown> | null
  return !!b && typeof b === 'object' && ['x1', 'y1', 'x2', 'y2'].every((k) => typeof b[k] === 'number')
}

/**
 * DB에서 읽은 값이 초안 모양인지. 백업처럼 밖에서 온 값은 아니지만, 앱을 고치다가 옛 모양이 남을 수 있어 믿지 않는다.
 * 필수 키의 타입만 본다 — verdict의 속은 검사하지 않는다 (없으면 null로 두는 것으로 충분하다).
 */
export function isDraftFields(v: unknown): v is DraftFields {
  const d = v as Record<string, unknown> | null
  if (!d || typeof d !== 'object' || d.v !== 1) return false
  if (typeof d.name !== 'string' || typeof d.note !== 'string' || typeof d.savedAt !== 'string') return false
  const p = d.place as Record<string, unknown> | null
  if (!p || typeof p !== 'object' || typeof p.name !== 'string' || typeof p.source !== 'string') return false
  if (d.crop !== null && !(typeof d.crop === 'object' && isBox((d.crop as Record<string, unknown>).box))) return false
  if (d.askedBox !== null && !isBox(d.askedBox)) return false
  return d.verdict === null || (typeof d.verdict === 'object' && d.verdict !== null)
}

/** 사진 칸의 값이 온전한지 */
function isStoredPhoto(v: unknown): v is StoredPhoto {
  const p = v as Record<string, unknown> | null
  return !!p && typeof p === 'object' && p.blob instanceof Blob && typeof p.name === 'string' && typeof p.type === 'string'
}

/**
 * 초안을 되살린다. 없거나, 7일이 지났거나, 모양이 깨졌거나, 사진이 없으면 null — 그때는 남은 조각을 지운다.
 * DB를 못 열어도 null (던지지 않는다).
 */
export async function loadDraft(now = new Date()): Promise<Draft | null> {
  try {
    const [fields, photo] = await Promise.all([dbGet<unknown>('meta', FIELDS_KEY), dbGet<unknown>('meta', PHOTO_KEY)])
    if (fields === undefined && photo === undefined) return null
    if (!isDraftFields(fields) || !isStoredPhoto(photo) || isDraftStale(fields.savedAt, now)) { await clearDraft(); return null }
    // 사파리의 옛 판은 File을 Blob으로 돌려주기도 한다 — 이름·형식을 따로 저장해 두었다가 다시 File로 만든다
    const file = photo.blob instanceof File ? photo.blob : new File([photo.blob], photo.name, { type: photo.type, lastModified: photo.lastModified })
    return { ...fields, file }
  } catch {
    return null
  }
}

/** 작은 값들을 덮어쓴다. 저장 시각은 지금으로. 실패하면 던진다 — 부르는 쪽(useDraft)이 삼킨다 */
export function saveDraftFields(fields: Omit<DraftFields, 'v' | 'savedAt'>, now = new Date()): Promise<void> {
  const value: DraftFields = { v: 1, ...fields, savedAt: now.toISOString() }
  return dbPut('meta', value, FIELDS_KEY)
}

/** 고른 사진을 넣는다 (사진을 고를 때 한 번). 실패하면 던진다 */
export function saveDraftPhoto(file: File): Promise<void> {
  const value: StoredPhoto = { blob: file, name: file.name, type: file.type, lastModified: file.lastModified }
  return dbPut('meta', value, PHOTO_KEY)
}

/** 초안을 지운다 (저장에 성공했거나 사용자가 버렸을 때). 없어도 성공한다 */
export async function clearDraft(): Promise<void> {
  await Promise.all([dbDelete('meta', FIELDS_KEY), dbDelete('meta', PHOTO_KEY)])
}
