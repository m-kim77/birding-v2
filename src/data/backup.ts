// 이동 기록(`tracks` 저장소)은 백업에 넣지 않는다 — 다시 내보내면 되는 자료이고 기록보다 훨씬 민감하다 (data/tracks.ts)
import { unzip, zip, type Unzipped, type Zippable } from 'fflate'
import type { PhotoKind, Sighting } from '../types'
import { JOURNAL_FILE, buildJournal, parseJournal, parsePhotoPath, photoPath, planMerge, shouldCopyPhoto, type MergePlan } from './backupFormat'
import { dbGetAll } from './db'
import { allPhotosOf, hasPhoto, putPhoto, writeSightingWithPhotos, type PhotoFile } from './photos'

/** 불러오기 결과: 합친 내용과, 읽지 못해 건너뛴 기록 수 */
export interface ImportResult extends MergePlan {
  skipped: number
}

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
 * 읽지 못하는 기록은 그것만 건너뛰고 수를 돌려준다 (`parseJournal`).
 * 더하거나 갱신하는 기록은 **그 기록 + 그 사진들**을 트랜잭션 하나로 쓴다 — 도중에 끊겨도 "기록은 최신인데 사진은 옛것"이 남지 않고,
 * 다시 불러오면 못 쓴 기록부터 다시 한다. 그대로 두는 기록은 빠진 사진만 채운다 (옛 판에서 끊긴 복원을 잇는다 — `shouldCopyPhoto`).
 * 쓰다 실패하면(용량 부족 등) 거기서 던진다 — 앞에서 쓴 기록은 온전하게 남는다.
 */
export async function importBackup(file: Blob): Promise<ImportResult> {
  let entries: Unzipped
  try { entries = await unzipAsync(new Uint8Array(await file.arrayBuffer())) } catch { throw new Error('백업 파일을 열 수 없습니다 (ZIP 파일이 아닙니다).') }
  const journalBytes = entries[JOURNAL_FILE]
  if (!journalBytes) throw new Error('탐조일지 백업 파일이 아닙니다.')
  const journal = parseJournal(new TextDecoder().decode(journalBytes))

  const plan = planMerge(await dbGetAll<Sighting>('sightings'), journal.sightings)
  const photos = photosById(entries)
  for (const s of [...plan.add, ...plan.update]) {
    await writeSightingWithPhotos(s, (photos.get(s.id) ?? []).map(({ kind, bytes }) => ({ kind, blob: jpeg(bytes) })))
  }
  const writing = new Set([...plan.add, ...plan.update].map((s) => s.id))
  for (const s of journal.sightings) {
    if (writing.has(s.id)) continue
    for (const { kind, bytes } of photos.get(s.id) ?? []) {
      if (shouldCopyPhoto(s.id, plan, true, await hasPhoto(s.id, kind))) await putPhoto(s.id, kind, jpeg(bytes))
    }
  }
  return { ...plan, skipped: journal.skipped }
}

/** ZIP 안의 사진을 기록 id별로 묶는다. 사진 경로가 아닌 항목은 무시한다. 바이트는 쓸 때 Blob으로 만든다 (한꺼번에 복사하면 메모리가 두 배) */
function photosById(entries: Unzipped): Map<string, Array<{ kind: PhotoKind; bytes: Uint8Array }>> {
  const out = new Map<string, Array<{ kind: PhotoKind; bytes: Uint8Array }>>()
  for (const [path, bytes] of Object.entries(entries)) {
    const photo = parsePhotoPath(path)
    if (!photo) continue
    const list = out.get(photo.id) ?? []
    list.push({ kind: photo.kind as PhotoKind, bytes })
    out.set(photo.id, list)
  }
  return out
}

/** ZIP의 바이트를 JPEG Blob으로 (fflate 배열의 타입 문제로 복사해서 넘긴다 — exportBackup 주석) */
function jpeg(bytes: Uint8Array): PhotoFile['blob'] {
  return new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' })
}
