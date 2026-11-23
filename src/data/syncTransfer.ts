/**
 * 드라이브와 실제로 주고받는 일: 드라이브의 모습 읽기, 기록 하나 받기, 줄의 항목 하나 올리기.
 * 순서·재시도는 sync.ts가, 무엇을 할지는 syncPlan.ts가 정한다.
 */
import { deleteFile, downloadFile, ensureFolder, listFiles, uploadFile } from '../lib/google/driveApi'
import type { PhotoKind, Sighting } from '../types'
import { dbGet } from './db'
import { normalizeSighting } from './normalizeSighting'
import { PHOTO_KINDS } from './photoKey'
import { getPhoto, hasPhoto, writeSightingIfNewer, type PhotoFile } from './photos'
import { PHOTOS_FOLDER, RECORDS_FOLDER, ROOT_FOLDER, photoFileName, recordFileName, recordTags, remoteRecordOf, shouldPushRecord, type QueueEntry, type RemoteRecord } from './syncPlan'

/** 한 번의 동기화 동안 들고 있는 드라이브의 모습. 올리면 여기도 고쳐서 같은 파일을 두 번 만들지 않는다 */
export interface Remote {
  /** '탐조일지 동기화' 폴더 — 이동 기록 폴더(tracks)는 스위치를 켠 기기만 그 아래에 만든다 (syncTracks.ts) */
  rootFolder: string
  recordsFolder: string
  photosFolder: string
  /** 기록 id → 기록 파일 */
  records: Map<string, RemoteRecord>
  /** 사진 파일 이름 → 파일 id */
  photos: Map<string, string>
}

/** 폴더를 찾거나 만들고, 기록·사진 목록을 읽는다 (요청 몇 번 — 파일 수백 개도 한두 쪽) */
export async function readRemote(): Promise<Remote> {
  const root = await ensureFolder(ROOT_FOLDER, 'root')
  const [recordsFolder, photosFolder] = await Promise.all([ensureFolder(RECORDS_FOLDER, root), ensureFolder(PHOTOS_FOLDER, root)])
  const [recordFiles, photoFiles] = await Promise.all([listFiles(recordsFolder), listFiles(photosFolder)])
  const records = new Map<string, RemoteRecord>()
  for (const f of recordFiles) {
    const r = remoteRecordOf(f)
    const prev = r && records.get(r.id)
    // 같은 기록 파일이 둘이면(두 기기가 동시에 처음 올림) 더 새것을 본다
    if (r && (!prev || r.updatedAt > prev.updatedAt)) records.set(r.id, r)
  }
  return { rootFolder: root, recordsFolder, photosFolder, records, photos: new Map(photoFiles.map((f) => [f.name, f.id])) }
}

/**
 * 드라이브의 기록 하나를 받아 기기에 쓴다 (기록과 받은 사진을 트랜잭션 하나로).
 * 사진은 기기에 없는 판만 받는다 — 사진은 기록을 만든 뒤 바뀌지 않아서(고치기는 글만 바꾼다), 다른 기기에서 글만 고친 기록을 받을 때
 * 있는 사진까지 다시 받으면 모바일 데이터만 쓴다. 기기에 있는 판은 그대로 남는다 (쓰는 쪽이 받은 판만 넣는다).
 * 내용이 깨졌으면 쓰지 않고 false. 받는 사이 이 기기에서 그 기록을 더 새로 고쳤으면 덮지 않는다 (true — 할 일은 끝났다) —
 * 사진을 받기 **전에** 한 번 보고, 쓰는 트랜잭션 안에서 한 번 더 본다 (사진을 받는 몇 초 사이에도 고칠 수 있다).
 * 네트워크 실패는 던진다.
 */
export async function pullRecord(r: RemoteRecord, remote: Remote): Promise<boolean> {
  let s: Sighting | null
  try { s = normalizeSighting(JSON.parse(await (await downloadFile(r.fileId)).text())) } catch (e) {
    if (e instanceof SyntaxError) return false
    throw e
  }
  if (!s || s.id !== r.id) return false
  const mine = await dbGet<Sighting>('sightings', s.id)
  if (mine && mine.updatedAt >= s.updatedAt) return true
  const photos: PhotoFile[] = []
  for (const kind of PHOTO_KINDS) {
    const fileId = remote.photos.get(photoFileName(s.id, kind))
    if (fileId && !(await hasPhoto(s.id, kind))) photos.push({ kind, blob: new Blob([await downloadFile(fileId)], { type: 'image/jpeg' }) })
  }
  await writeSightingIfNewer(s, photos)
  return true
}

/**
 * 줄의 항목 하나를 드라이브에 반영한다. 성공해야 돌아온다 — 실패는 던진다 (항목은 줄에 남는다).
 * - put: 사진을 **먼저**, 기록 파일을 **마지막에** 올린다. 기록 파일이 드라이브에 보이면 그 사진도 이미 있다는 뜻이 된다.
 *   기록이 그새 지워졌으면 할 일이 없다 (지움 항목이 이 항목을 이미 덮었거나, 드라이브의 더 늦은 지움을 따라
 *   `planPull`이 기기에서 지웠다 — 이때 올리면 지운 기록이 되살아난다).
 *   드라이브에 더 새 판이 있으면 올리지 않는다 (syncPlan.ts shouldPushRecord) — 이때만 true를 준다: 항목은 끝내고,
 *   부르는 쪽이 곧 다시 동기화해 그 판을 받아 온다.
 * - delete: 사진 파일을 지우고, 기록 파일을 "지웠음" 표시로 바꾼다 — 다른 기기가 보고 따라 지운다.
 */
export async function pushEntry(e: QueueEntry, remote: Remote): Promise<boolean> {
  if (e.op === 'delete') {
    for (const kind of PHOTO_KINDS) {
      const name = photoFileName(e.id, kind)
      const fileId = remote.photos.get(name)
      if (fileId) { await deleteFile(fileId); remote.photos.delete(name) }
    }
    await putRecordFile(e.id, { id: e.id, deleted: true, updatedAt: e.at }, e.at, true, remote)
    return false
  }
  const s = await dbGet<Sighting>('sightings', e.id)
  if (!s) return false
  if (!shouldPushRecord(s, remote.records.get(s.id))) return true
  for (const kind of PHOTO_KINDS) await pushPhoto(s.id, kind, e.photos, remote)
  await putRecordFile(s.id, s, s.updatedAt, false, remote)
  return false
}

/** 사진 한 판을 올린다 — 기기에 있고, (다시 올리라고 했거나 드라이브에 없을 때만) */
async function pushPhoto(id: string, kind: PhotoKind, force: boolean, remote: Remote): Promise<void> {
  const name = photoFileName(id, kind)
  const existingId = remote.photos.get(name)
  if (existingId && !force) return
  const blob = await getPhoto(id, kind)
  if (!blob) return
  remote.photos.set(name, await uploadFile({ name, parentId: remote.photosFolder, blob: new Blob([blob], { type: 'image/jpeg' }), existingId }))
}

/** 기록 파일(JSON)을 만들거나 바꾸고 꼬리표를 단다 */
async function putRecordFile(id: string, body: unknown, updatedAt: string, deleted: boolean, remote: Remote): Promise<void> {
  const existing = remote.records.get(id)
  const fileId = await uploadFile({
    name: recordFileName(id), parentId: remote.recordsFolder, existingId: existing?.fileId,
    blob: new Blob([JSON.stringify(body)], { type: 'application/json' }), appProperties: recordTags(updatedAt, deleted),
  })
  remote.records.set(id, { id, fileId, updatedAt, deleted })
}
