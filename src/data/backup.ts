import { unzip, zip, type Unzipped, type Zippable } from 'fflate'
import type { PhotoKind, Sighting } from '../types'
import { JOURNAL_FILE, buildJournal, parseJournal, parsePhotoPath, photoPath, planMerge, shouldCopyPhoto, type MergePlan } from './backupFormat'
import { dbGetAll, dbPut } from './db'
import { allPhotosOf, hasPhoto, putPhoto } from './photos'

/** fflate의 콜백 API를 Promise로 */
const zipAsync = (files: Zippable) => new Promise<Uint8Array>((resolve, reject) => zip(files, { level: 0 }, (err, out) => (err ? reject(err) : resolve(out))))
const unzipAsync = (data: Uint8Array) => new Promise<Unzipped>((resolve, reject) => unzip(data, (err, out) => (err ? reject(err) : resolve(out))))

/**
 * 모든 기록과 사진을 ZIP 하나로 묶는다.
 * 압축은 하지 않는다(level 0) — JPEG는 더 줄지 않고, 사진 수백 장을 압축하면 폰에서 몇 분이 걸린다.
 * 사진이 많으면 메모리를 많이 쓴다 (전부 한 번에 올린다). 수천 장 규모가 되면 스트리밍 방식으로 바꿔야 한다.
 */
export async function exportBackup(): Promise<Blob> {
  const sightings = await dbGetAll<Sighting>('sightings')
  const files: Zippable = { [JOURNAL_FILE]: new TextEncoder().encode(JSON.stringify(buildJournal(sightings, new Date()))) }
  for (const s of sightings) {
    for (const p of await allPhotosOf(s.id)) files[photoPath(s.id, p.kind)] = new Uint8Array(await p.blob.arrayBuffer())
  }
  // fflate의 Uint8Array는 타입상 SharedArrayBuffer일 수도 있다고 표시돼 있어 Blob이 받지 않는다 — 복사해서 넘긴다
  return new Blob([new Uint8Array(await zipAsync(files))], { type: 'application/zip' })
}

/**
 * 백업 파일을 기기의 기록과 합친다. 합치는 규칙은 `planMerge` (같은 id는 최신이 이기고, 기기에만 있는 것은 그대로).
 * 파일이 ZIP이 아니거나 우리 백업이 아니면 한국어 Error를 던지고 **아무것도 바꾸지 않는다** (검사를 다 끝낸 뒤에 쓴다).
 * 기록을 먼저 다 쓰고 사진을 쓴다. 사진 도중에 끊겨도 같은 파일을 다시 불러오면 빠진 사진만 이어서 들어온다 (`shouldCopyPhoto`).
 */
export async function importBackup(file: Blob): Promise<MergePlan> {
  let entries: Unzipped
  try { entries = await unzipAsync(new Uint8Array(await file.arrayBuffer())) } catch { throw new Error('백업 파일을 열 수 없습니다 (ZIP 파일이 아닙니다).') }
  const journalBytes = entries[JOURNAL_FILE]
  if (!journalBytes) throw new Error('탐조일지 백업 파일이 아닙니다.')
  const journal = parseJournal(new TextDecoder().decode(journalBytes))

  const plan = planMerge(await dbGetAll<Sighting>('sightings'), journal.sightings)
  const inJournal = new Set(journal.sightings.map((s) => s.id))
  const updating = new Set(plan.update.map((s) => s.id))
  for (const s of [...plan.add, ...plan.update]) await dbPut('sightings', s)
  for (const [path, bytes] of Object.entries(entries)) {
    const photo = parsePhotoPath(path)
    if (!photo || !inJournal.has(photo.id)) continue
    const kind = photo.kind as PhotoKind
    // 갱신되는 기록은 어차피 덮어쓰므로 DB를 묻지 않는다 — 사진 수백 장에서 트랜잭션 수를 줄인다
    const here = updating.has(photo.id) ? false : await hasPhoto(photo.id, kind)
    if (!shouldCopyPhoto(photo.id, plan, true, here)) continue
    await putPhoto(photo.id, kind, new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }))
  }
  return plan
}
