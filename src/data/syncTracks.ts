/**
 * 이동 기록의 드라이브 사본 — '이동 기록도 구글 드라이브에 올리기'를 켠 기기에서만 올리고 받아 합친다 (규칙은 syncTracksPlan.ts).
 * 원본은 기기다. 올리는 것은 이 기기에 골라 둔 점뿐이고(타임라인 원본 파일은 앱에 남아 있지 않다), 브라우저에서 사용자의 드라이브로 곧장 간다 —
 * 이 사이트의 서버(api/drive.ts)는 지나지 않는다. 좌표를 console·오류 문구·꼬리표에 넣지 않는다.
 *
 * 기록의 올릴 일 줄(syncQueue)에는 넣지 않는다 — 줄의 수가 "기록 N건"으로 보이고, pushEntry는 id를 sightings에서 찾는다.
 * 대신 기록 동기화(sync.ts run)가 끝난 뒤 한 단계로 돈다: 앱을 열고 처음 · 사용자가 '지금 동기화' · 이 기기에서 넣기·스위치 켜기 뒤에만
 * (이동 기록은 석 달에 한 번 바뀐다 — 기록을 저장할 때마다 2만 점을 읽지 않는다). 실패하면 30분이 지난 뒤의 동기화 때 다시 한다
 * ('지금 동기화'·넣기·스위치 켜기 뒤에는 곧바로. 따로 재시도 타이머 없음 — syncTracksPlan.ts shouldRunTracksStep).
 *
 * 스위치는 기기마다다 (`meta`, 기본 끔) — 같은 계정으로 로그인한 공용 PC에 몇 달치 이동 경로가 말없이 내려오지 않게.
 */
import { NotConnectedError } from '../lib/google/driveAuth'
import { deleteFile, downloadFile, ensureFolder, findFolders, listFiles, uploadFile, type DriveFile } from '../lib/google/driveApi'
import { dbGet, dbPut, dbWriteAll } from './db'
import { ROOT_FOLDER } from './syncPlan'
import { getSyncStatus, setTracksStatus, tracksStatusOf, type TracksSyncStatus } from './syncStatus'
import {
  CLEARED_FILE, TRACKS_FOLDER, clearDecision, clearedAtOf, decodeMonth, encodeMonth, hasMonthFiles, localMonthsOf, monthFileName, monthTags,
  planDownload, planUpload, remoteMonthOf, shouldRunTracksStep, type LocalMonth, type RemoteMonth, type TracksStepMemo,
} from './syncTracksPlan'
import { TRACKS_SYNC_ON_KEY, clearTracks, mergeReceivedTracks, readAllPoints, readTracksMeta } from './tracks'

/** `meta`: 드라이브에 이동 기록이 있다고 이 기기가 마지막으로 본 것 (TracksSyncStatus.onDrive) */
const ON_DRIVE_KEY = 'tracksOnDrive'
/** `meta`: 스위치를 켠 뒤 본 드라이브의 "지웠음" 표시 값. 없으면 켠 뒤 아직 못 본 것 — 처음 본 값을 받아들인다 (clearDecision) */
const CLEAR_SEEN_KEY = 'tracksClearSeen'

/** 이 탭에서 이동 기록 단계를 언제 다시 돌지의 기억 (syncTracksPlan.ts shouldRunTracksStep) — 앱을 열면 처음부터 */
const memo: TracksStepMemo = { checkedOnce: false, changeRev: 0, syncedRev: 0, failed: null }

/** 이 기기에서 이동 기록이 바뀌었다고 적는다 (넣기·스위치 켜기) — 다음 동기화가 이동 기록 단계도 돈다 (전에 실패했어도 곧바로) */
export function markTracksChanged(): void {
  memo.changeRev += 1
}

/** 이 기기의 스위치가 켜졌는지. 저장소를 못 열면 false (꺼진 쪽이 안전하다) */
export async function isTracksSyncOn(): Promise<boolean> {
  return (await dbGet<boolean>('meta', TRACKS_SYNC_ON_KEY).catch(() => false)) === true
}

/** 스위치와 '드라이브에 있음'을 읽어 상태에 적는다 (앱을 열 때·연결할 때). 못 읽으면 꺼짐으로 */
export async function loadTracksSync(): Promise<void> {
  const [on, onDrive] = await Promise.all([isTracksSyncOn(), dbGet<boolean>('meta', ON_DRIVE_KEY).catch(() => false)])
  setTracksStatus({ on, onDrive: onDrive === true })
}

/**
 * 스위치를 켜거나 끈다. 켤 때는 드라이브의 "지웠음" 표시를 새로 받아들이게 본 값을 지운다 (알고 다시 올리는 것이다) —
 * 부르는 쪽이 곧 동기화를 돌린다 (sync.ts syncAgain). 끌 때는 올리기·받기만 멈추고 드라이브의 사본은 그대로 둔다.
 * 저장소에 못 쓰면 던진다 (스위치는 그대로다).
 */
export async function setTracksSyncOn(on: boolean): Promise<void> {
  await dbWriteAll(['meta'], (store) => {
    store('meta').put(on, TRACKS_SYNC_ON_KEY)
    if (on) store('meta').delete(CLEAR_SEEN_KEY)
  })
  if (on) markTracksChanged()
  setTracksStatus({ on, note: null })
}

/**
 * 이 기기의 이동 기록을 지운다 — 스위치도 같은 트랜잭션에서 꺼진다 (tracks.ts clearTracks). 드라이브의 사본은 그대로다.
 * 드라이브에 사본이 남아 있을 수 있는지(스위치가 켜져 있었거나 드라이브에 있다고 봤다)를 준다 — 결과 줄이 그렇게 알린다. DB 오류는 던진다.
 */
export async function clearDeviceTracks(): Promise<boolean> {
  const [on, onDrive] = await Promise.all([isTracksSyncOn(), dbGet<boolean>('meta', ON_DRIVE_KEY).catch(() => false)])
  await clearTracks()
  setTracksStatus({ on: false, note: null })
  return on || onDrive === true
}

/**
 * 기록 동기화 뒤의 이동 기록 단계. 스위치가 꺼졌으면 아무것도 하지 않는다. 켜져 있어도 앱을 열고 처음 · `manual` ·
 * 이 기기에서 바뀐 뒤(markTracksChanged)에만 돌고, 실패한 뒤에는 30분 동안 자동으로 다시 돌지 않는다 (shouldRunTracksStep).
 * 결과는 상태(tracks.note)에 적는다.
 * 로그인이 풀린 것(NotConnectedError)만 던진다 — 실패로 치지 않는다. 그 밖의 실패는 이동 기록 카드에만 적고 기록 동기화의 결과를 바꾸지 않는다.
 */
export async function syncTracksStep(rootFolder: string, manual: boolean): Promise<void> {
  if (!(await isTracksSyncOn())) return
  if (!shouldRunTracksStep(memo, manual, Date.now())) return
  const rev = memo.changeRev
  setTracksStatus({ note: { kind: 'syncing' } })
  try {
    setTracksStatus(await exchange(rootFolder))
    memo.checkedOnce = true
    memo.syncedRev = rev
    memo.failed = null
  } catch (e) {
    if (e instanceof NotConnectedError) { setTracksStatus({ note: null }); throw e }
    memo.failed = { rev, at: Date.now() }
    setTracksStatus({ note: { kind: 'failed', reason: e instanceof Error ? e.message : '' } })
  }
}

/** 달별 지문만 */
function digestsOf(months: Map<string, LocalMonth>): Map<string, string> {
  return new Map([...months].map(([month, m]) => [month, m.digest]))
}

/**
 * 한 바퀴: 목록 → "지웠음" 표시 보기 → 지문이 다른 달을 받아 합치기 → 다시 지문 → 올리기. 바꿀 상태를 준다.
 * 켠 뒤에 누가 드라이브의 이동 기록을 지웠으면 이 기기의 점은 두고 스위치만 끈다 (다시 올리면 지운 것이 되살아난다). 실패는 던진다.
 */
async function exchange(rootFolder: string): Promise<Partial<TracksSyncStatus>> {
  const folder = await ensureFolder(TRACKS_FOLDER, rootFolder)
  const files = await listFiles(folder)
  const clearedAt = clearedAtOf(files)
  const decision = clearDecision((await dbGet<string>('meta', CLEAR_SEEN_KEY)) ?? null, clearedAt)
  if (decision === 'stop') {
    // 지운 기기가 도중에 끊겨 달 파일이 남았으면 '드라이브에 있음'으로 둔다 — 지우기 버튼이 남아 남은 이동 경로를 지울 수 있게
    const left = hasMonthFiles(files)
    await dbWriteAll(['meta'], (store) => { store('meta').put(false, TRACKS_SYNC_ON_KEY); store('meta').put(left, ON_DRIVE_KEY) })
    return { on: false, onDrive: left, note: { kind: 'clearedElsewhere' } }
  }
  if (decision === 'adopt') await dbPut('meta', clearedAt, CLEAR_SEEN_KEY)
  const remote = files.flatMap((f) => remoteMonthOf(f) ?? [])
  const { months, received, keep } = await receive(remote)
  const rev = tracksStatusOf(getSyncStatus()).rev + (received ? 1 : 0)
  // 받는 사이 사용자가 스위치를 껐거나 이 기기를 지웠으면 올리지 않는다
  if (!(await isTracksSyncOn())) return { rev, note: null }
  const { done, sent } = await send(folder, months, remote, keep)
  // 다 올렸으면 기기의 달이 모두 드라이브에 있다. 도중에 멈췄으면 그때까지 올린 달·원래 있던 파일만 — 지우기 버튼이 남아야 한다
  const onDrive = remote.length > 0 || sent || (done && months.size > 0)
  await dbPut('meta', onDrive, ON_DRIVE_KEY)
  if (!done) return { onDrive, rev, note: null }
  let count = 0
  for (const m of months.values()) count += m.points.length
  return { onDrive, rev, note: { kind: 'same', count } }
}

/**
 * 드라이브의 지문이 기기와 다른 달 파일을 받아 기기에 합친다 (점의 합집합, tracks.ts mergeReceivedTracks — 넣은 날은 올린 기기의 것과 견줘 늦은 쪽).
 * 합친 뒤의 달별 점, 기기가 바뀌었는지, 읽지 못한 새 모양 파일이 있는 달(keep — 덮지 않는다)을 준다. 네트워크·DB 실패는 던진다.
 */
async function receive(remote: RemoteMonth[]): Promise<{ months: Map<string, LocalMonth>; received: boolean; keep: Set<string> }> {
  const before = await localMonthsOf(await readAllPoints())
  const keep = new Set<string>()
  let received = false
  for (const r of planDownload(digestsOf(before), remote)) {
    const points = decodeMonth(await (await downloadFile(r.fileId)).text(), r.month)
    if (points === null) { keep.add(r.month); continue }
    if (points.length > 0 && (await mergeReceivedTracks(points, new Date(r.importedAt))) > 0) received = true
  }
  return { months: received ? await localMonthsOf(await readAllPoints()) : before, received, keep }
}

/**
 * 기기의 달 가운데 드라이브와 다른 달을 올리고(있던 파일은 PATCH로 덮는다 — 요청 하나라 반쪽 파일이 없다), 같은 달의 남는 파일을 지운다.
 * 꼬리표의 넣은 날은 이 기기 요약의 것이다. 실패는 던진다 — 올리다 끊겨도 다음에 지문이 달라 다시 올린다.
 * 달마다 올리기 전에 스위치를 다시 본다 — 올리는 사이 사용자가 스위치를 끄거나 이 기기의 이동 기록을 지우면(스위치도 꺼진다) 남은 달은 보내지 않고 멈춘다.
 * "끄면 기기 밖으로 나가지 않는다"는 약속(개인정보 안내)을 지키려는 것이다. 이미 보내는 중이던 한 달은 끝까지 간다.
 * 끝까지 갔는지(`done`)와 하나라도 올렸는지(`sent`)를 준다.
 */
async function send(folder: string, months: Map<string, LocalMonth>, remote: RemoteMonth[], keep: Set<string>): Promise<{ done: boolean; sent: boolean }> {
  const importedAt = (await readTracksMeta())?.importedAt ?? new Date().toISOString()
  let sent = false
  for (const step of planUpload(digestsOf(months), remote, keep)) {
    if (!(await isTracksSyncOn())) return { done: false, sent }
    const m = months.get(step.month)!
    if (step.upload) {
      await uploadFile({
        name: monthFileName(step.month), parentId: folder, existingId: step.fileId,
        blob: new Blob([encodeMonth(step.month, m.points)], { type: 'application/json' }), appProperties: monthTags(m.digest, m.points.length, importedAt),
      })
      sent = true
    }
    for (const id of step.remove) await deleteFile(id)
  }
  return { done: true, sent }
}

/**
 * 드라이브의 이동 기록을 지운다 (이 기기의 점은 그대로). 순서: "지웠음" 표시(cleared.json)를 **먼저** 올리고 → 이 기기의 스위치를 끄고
 * 그 표시를 본 것으로 적고 → 달 파일을 지운다. 표시가 먼저여야 도중에 끊겨도 스위치를 켠 다른 기기가 다시 올리지 않는다 (그 기기는 표시를 보고 스위치만 끈다).
 * 스위치를 달 파일보다 먼저 끄는 것은, 지우다 끊긴 뒤 이 기기가 자기 표시를 '다른 기기가 지움'으로 읽지도 남은 달 파일을 다시 올리지도 않게 —
 * 끊긴 동안은 '드라이브에 있음'으로 두어 지우기 버튼이 남는다 (다시 누르면 남은 달 파일부터 다시 지운다).
 * 두 기기가 동시에 처음 켜 `tracks` 폴더가 둘 생겼으면, 동기화가 보지 않는 나머지 폴더의 달 파일도 지운다 (표시는 동기화가 보는 폴더에만 둔다).
 * 드라이브를 사람이 웹에서 직접 지운 경우는 막지 못한다 — 그래서 안내는 앱의 이 버튼을 쓰라고 한다.
 * 연결이 풀렸으면 NotConnectedError, 그 밖의 실패는 DriveError(한국어)로 던진다.
 * 동기화와 겹치지 않게 sync.ts clearDriveTracksNow로 부른다.
 */
export async function clearDriveTracks(): Promise<void> {
  const root = await ensureFolder(ROOT_FOLDER, 'root')
  const folder = await ensureFolder(TRACKS_FOLDER, root)
  const files = await listFiles(folder)
  const marker = files.find((f) => f.name === CLEARED_FILE)
  const clearedAt = new Date().toISOString()
  await uploadFile({
    name: CLEARED_FILE, parentId: folder, existingId: marker?.id,
    blob: new Blob([JSON.stringify({ v: 1, clearedAt })], { type: 'application/json' }), appProperties: { clearedAt },
  })
  await dbWriteAll(['meta'], (store) => {
    store('meta').put(false, TRACKS_SYNC_ON_KEY)
    store('meta').put(true, ON_DRIVE_KEY)
    store('meta').put(clearedAt, CLEAR_SEEN_KEY)
  })
  setTracksStatus({ on: false, onDrive: true, note: null })
  // 달 파일과, 두 기기가 동시에 지워 생긴 남는 표시 파일을 지운다 (방금 덮은 표시는 남긴다)
  await removeTrackFiles(files, marker)
  // 같은 이름의 다른 tracks 폴더 — 동기화(ensureFolder)는 가장 먼저 만든 폴더만 보지만, 동시에 처음 켠 기기가 다른 폴더에 먼저 올린 이동 경로가 남는다
  for (const other of await findFolders(TRACKS_FOLDER, root)) if (other !== folder) await removeTrackFiles(await listFiles(other))
  // 여기까지 끝나야 '드라이브에 있음'을 거둔다 — 도중에 끊기면 버튼이 남아 다시 누르면 남은 것부터 지운다
  await dbPut('meta', false, ON_DRIVE_KEY)
  setTracksStatus({ onDrive: false })
}

/**
 * 폴더의 파일 가운데 이 앱의 이동 기록 파일(달 파일·"지웠음" 표시)을 지운다. `keep`은 남긴다.
 * 이름·꼬리표가 우리 모양이 아닌 파일(사람이 넣은 것)은 건드리지 않는다. 실패는 던진다.
 */
async function removeTrackFiles(files: DriveFile[], keep?: DriveFile): Promise<void> {
  for (const f of files) if (f !== keep && (f.name === CLEARED_FILE || remoteMonthOf(f))) await deleteFile(f.id)
}
