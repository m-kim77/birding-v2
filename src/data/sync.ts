/**
 * 드라이브 동기화를 돌린다: 로그인한 계정이 이 기기의 계정인지 보고 → 드라이브의 모습을 읽고 → 받을 것을 받고 → 줄의 일을 올린다 →
 * (스위치를 켠 기기만) 이동 기록을 맞춘다. 다른 계정이면 아무것도 주고받지 않고 멈춰 사용자에게 묻는다 (syncAccount.ts).
 * 원본은 기기다. 여기서 무엇이 실패해도 기기의 기록은 그대로다 — 드라이브 쪽 일만 줄에 남아 다음에 다시 한다.
 *
 * 언제 도나: 앱을 열 때, 기록을 저장·고침·지운 뒤(몇 초 모아서), 도감을 열 때, 인터넷이 다시 붙을 때, 탭으로 돌아올 때,
 * 올릴 일이 남아 있으면 1분마다. 한 번에 하나만 돈다.
 */
import { NotConnectedError, connectDrive, disconnectDrive, loadDriveConfig } from '../lib/google/driveAuth'
import { DriveError } from '../lib/google/driveApi'
import type { Sighting } from '../types'
import { dbGet, dbGetAll, dbPut } from './db'
import { deletePulledSighting } from './photos'
import { afterFailure, dueEntries, planPull } from './syncPlan'
import { LAST_SYNC_KEY, finishEntry, isDriveLinked, listQueue, noteChange, saveFailure, setDriveLinked } from './syncQueue'
import { getSyncStatus, setSyncStatus, tracksStatusOf } from './syncStatus'
import { clearDriveTracks, loadTracksSync, setTracksSyncOn, syncTracksStep } from './syncTracks'
import { pullRecord, pushEntry, readRemote, type Remote } from './syncTransfer'
import { adoptAskedAccount, askedTracksWasOn, checkAccount, forgetAskedAccount, isAccountAsked } from './syncAccount'

let running: Promise<void> | null = null
/** 받아서 기기가 바뀌었을 때 부른다 (일지가 다시 읽는다) */
let onPulled: () => void = () => {}

/** 일지가 "다시 읽기"를 건넨다 */
export function setOnPulled(fn: () => void): void {
  onPulled = fn
}

/** 줄의 수를 상태에 적는다 */
async function refreshCounts(): Promise<void> {
  const q = await listQueue().catch(() => [])
  setSyncStatus({ pending: q.length, stuck: q.filter((e) => e.stuck).length })
}

/**
 * 한 번 동기화한다. 이미 돌고 있으면 그것을 기다린다. 연결하지 않았으면 아무것도 하지 않는다.
 * `manual`(사용자가 누름)이면 자동 재시도를 멈춘 항목까지 다시 한다.
 * 던지지 않는다 — 결과는 상태(phase·message)로 알린다.
 */
export function syncNow(manual = false): Promise<void> {
  running ??= run(manual).finally(() => { running = null })
  return running
}

/** syncNow의 본체 */
async function run(manual: boolean): Promise<void> {
  if (!(await isDriveLinked())) return
  try {
    // 다른 구글 계정이라 묻는 중이면 드라이브에 아무것도 묻지 않고 멈춘다 — 인터넷이 끊겨 있어도 그 물음이 먼저 보이게 앞에 둔다
    if (await isAccountAsked()) { setSyncStatus({ phase: 'account', message: '' }); return }
    if (!navigator.onLine) { setSyncStatus({ phase: 'offline', message: '' }); return }
    setSyncStatus({ phase: 'syncing', message: '' })
    // 기록을 주고받기 전에, 출입증의 계정이 이 기기가 동기화해 온 계정인지 본다 (다르면 묻는 중으로 적고 이동 기록 스위치를 끈다)
    if (!(await checkAccount())) { setSyncStatus({ phase: 'account', message: '' }); return }
    const remote = await readRemote()
    await pull(remote)
    const failed = await push(remote, manual)
    // 이동 기록은 기록 뒤에 따로 한 단계 (syncTracks.ts — 스위치를 켠 기기만). 그 실패는 이동 기록 카드에만 적고
    // 기록 쪽 결과(마지막 동기화·오류)를 바꾸지 않는다. 로그인이 풀린 것만 아래 catch로 온다
    await syncTracksStep(remote.rootFolder, manual)
    const now = new Date().toISOString()
    if (failed === 0) await dbPut('meta', now, LAST_SYNC_KEY)
    setSyncStatus({ phase: failed ? 'error' : 'idle', lastSyncAt: failed ? getSyncStatus().lastSyncAt : now, message: failed ? `${failed}건을 올리지 못했습니다. 잠시 뒤 다시 합니다.` : '' })
  } catch (e) {
    if (e instanceof NotConnectedError) setSyncStatus({ phase: 'disconnected', message: '' })
    else setSyncStatus({ phase: navigator.onLine ? 'error' : 'offline', message: e instanceof Error ? e.message : '동기화하지 못했습니다.' })
  } finally {
    await refreshCounts()
  }
}

/** 드라이브 쪽이 새것인 기록을 받고, 다른 기기에서 지운 기록을 지우고, 기기 쪽이 새것인 기록을 줄에 넣는다 */
async function pull(remote: Remote): Promise<void> {
  const local = await dbGetAll<Sighting>('sightings')
  const pending = new Set((await listQueue()).map((e) => e.id))
  const plan = planPull(local, [...remote.records.values()], pending)
  let changed = false
  for (const r of plan.download) changed = (await pullRecord(r, remote)) || changed
  for (const id of plan.removeLocal) changed = (await deletePulledSighting(id, remote.records.get(id)!.updatedAt)) || changed
  // 사진은 다시 올리라고 하지 않는다 — 드라이브에 없는 판은 어차피 올라가고(pushPhoto), 있는 판은 기기 것과 같다 (사진은 바뀌지 않는다)
  for (const id of plan.upload) await noteChange(id, 'put', false)
  if (changed) onPulled()
}

/**
 * 줄의 일을 차례로 올린다. 실패한 수를 준다. 연결이 풀렸으면(NotConnectedError) 거기서 멈추고 던진다 —
 * 남은 일은 모두 줄에 그대로 있다.
 */
async function push(remote: Remote, manual: boolean): Promise<number> {
  let failed = 0
  for (const entry of dueEntries(await listQueue(), new Date(), manual)) {
    try {
      await pushEntry(entry, remote)
      await finishEntry(entry)
    } catch (e) {
      if (e instanceof NotConnectedError) throw e
      failed += 1
      await saveFailure(afterFailure(entry, e instanceof Error ? e.message : '실패', new Date()))
      // 인터넷이 끊겼으면 남은 일도 다 실패한다 — 실패 횟수만 올리지 않게 여기서 멈춘다
      if (e instanceof DriveError && e.status === 0) break
    }
  }
  return failed
}

/**
 * 앱을 열 때 한 번: 연결했던 사용자면 상태를 읽고 동기화한다. 연결 안 한 사용자는 서버에 묻지도 않는다.
 * 설정 카드가 열리면 `loadConfig`로 설정 상태를 따로 묻는다.
 */
export async function startSync(): Promise<void> {
  const linked = await isDriveLinked()
  setSyncStatus({ linked, lastSyncAt: (await dbGet<string>('meta', LAST_SYNC_KEY).catch(() => '')) ?? '' })
  if (!linked) return
  // 묻는 중이면 설정 상태(네트워크)를 기다리기 전에 알린다 — 그 사이 이동 기록 카드의 스위치·지우기 버튼이 잠깐 보이지 않게.
  // 못 읽으면 넘어간다 (아래 동기화가 다시 읽고, 못 읽으면 오류로 멈춘다)
  if (await isAccountAsked().catch(() => false)) setSyncStatus({ phase: 'account', message: '' })
  await loadTracksSync()
  await loadConfig()
  await syncNow()
}

/** 설정 상태(운영자 설정 여부·클라이언트 ID·연결 여부)를 읽어 상태에 적는다. 네트워크 실패는 offline으로 */
export async function loadConfig(): Promise<void> {
  try {
    const c = await loadDriveConfig()
    setSyncStatus({ configured: c.configured, clientId: c.clientId, ...(getSyncStatus().linked && !c.connected ? { phase: 'disconnected' } : {}) })
  } catch {
    // 다른 계정이라 묻는 중이면 그 물음을 가리지 않는다 — '합치지 않고 연결 끊기'는 인터넷이 돌아오면 다시 누르면 된다
    if (getSyncStatus().phase !== 'account') setSyncStatus({ phase: 'offline' })
  }
}

/**
 * 구글로 로그인해 드라이브를 연결하고 곧바로 동기화한다 (처음이면 기기의 기록이 전부 올라가고, 다른 기기의 기록이 내려온다).
 * 전에 이 기기와 동기화하던 계정과 다른 계정이면 동기화가 주고받기 전에 멈추고 묻는다 (run → checkAccount).
 * 사용자가 누른 순간에 불러야 한다 (로그인 창). 취소·실패는 한국어 Error로 던진다.
 */
export async function connect(): Promise<void> {
  await connectDrive(getSyncStatus().clientId)
  // 새로 로그인했다 — 전에 묻던 것은 거두고 이번 계정을 처음부터 다시 견준다 (전 계정으로 돌아왔으면 묻지 않고 이어 간다)
  await forgetAskedAccount()
  await setDriveLinked(true)
  setSyncStatus({ linked: true, phase: 'idle', message: '' })
  await loadTracksSync()
  await syncNow(true)
}

/**
 * 연결을 끊는다. 줄은 지우지 않는다 — 다시 연결하면 못 올린 일(특히 지운 기록)부터 이어서 한다.
 * 이동 기록 스위치는 끈다 — 다시 연결하는 계정이 다를 수 있어, 이동 기록은 다시 켜야 올린다 (드라이브의 사본은 그대로).
 * 로그인이 저절로 풀린 것(disconnected)은 끊은 것이 아니라 이 함수를 지나지 않는다 — 그때 스위치는 그대로다
 * (다른 계정으로 다시 로그인하면 동기화가 멈추고 물을 때 끈다, syncAccount.ts). 이 기기의 계정 표지도 지우지 않는다.
 */
export async function disconnect(): Promise<void> {
  await disconnectDrive()
  await setDriveLinked(false)
  await setTracksSyncOn(false)
  setSyncStatus({ linked: false, phase: 'idle', message: '' })
}

/**
 * '이 계정에 합치기': 다른 계정으로 로그인해 묻던 것을 받아들이고 곧 동기화한다 — 이 기기의 기록·사진이 그 계정의 드라이브에 올라가고
 * 그 계정의 기록이 이 기기로 내려와 섞인다. 이동 기록 스위치는 꺼진 채고 전 계정 기준의 '드라이브에 있음'도 거둔다 (다시 켜야 올리고, 켜면 새 계정의 모습을 다시 본다).
 * 저장소 오류는 던진다 (묻는 중 그대로).
 */
export async function joinAccount(): Promise<void> {
  await adoptAskedAccount()
  setSyncStatus({ phase: 'idle', message: '' })
  await syncNow(true)
}

/**
 * '합치지 않고 연결 끊기': 새 계정의 연결을 끊고(이동 기록 스위치도 꺼진다) 묻기를 거둔다. 이 기기의 계정 표지는 그대로라,
 * 전에 쓰던 계정으로 다시 로그인하면 묻지 않고 이어서 동기화한다 — 다만 이동 기록 스위치는 꺼진 채라, 묻는 단계가 껐거나 지금 켜져 있었는지를 준다
 * (결과 줄이 알린다, settings/driveText.ts refusedText). 끊기가 실패하면 한국어 Error로 던진다 — 묻는 중 그대로라 동기화는 돌지 않는다.
 */
export async function refuseAccount(): Promise<boolean> {
  // 끊기 전에 읽는다 — disconnect가 스위치를 끄고, forgetAskedAccount가 묻던 값을 지운다
  const tracksWasOn = (await askedTracksWasOn()) || tracksStatusOf(getSyncStatus()).on
  await disconnect()
  await forgetAskedAccount()
  return tracksWasOn
}

/**
 * 도는 동기화가 있으면 끝나기를 기다렸다가 한 번 더 돈다 — 방금 바꾼 것(이동 기록 스위치 켜기)을 도는 판이 못 봤을 수 있다.
 * 던지지 않는다 (syncNow와 같다).
 */
export async function syncAgain(): Promise<void> {
  while (running) await running
  await syncNow()
}

/**
 * 드라이브의 이동 기록을 지운다 (syncTracks.ts clearDriveTracks). 도는 동기화가 있으면 끝나기를 기다린다 — 그 판이 올리던 달 파일이
 * 지운 뒤에 다시 생기지 않게. 지우는 동안 부른 동기화는 이것이 끝나기를 기다렸다가 돌지 않고 끝난다 (다음 계기에 돈다).
 * 실패는 한국어 Error로 던진다 — 설정 카드가 결과 줄에 적는다. 도중에 끊겼으면 다시 누르면 된다.
 * 다른 구글 계정이라 합칠지 묻는 중이면 드라이브에 닿지 않고 거절한다 — 지금 출입증은 묻는 새 계정의 것이라, 그 계정의 이동 기록이 지워진다.
 */
export async function clearDriveTracksNow(): Promise<void> {
  while (running) await running
  // 묻는 중인지는 자물쇠(running) 안에서 본다 — 밖에서 기다리면 그 사이 다른 동기화가 끼어든다
  const job = (async () => {
    if (await isAccountAsked()) throw new Error('다른 구글 계정으로 로그인해 합칠지 묻는 중이라 지우지 않았습니다. 드라이브 카드에서 먼저 정해 주세요.')
    await clearDriveTracks()
  })()
  running = job.then(() => {}, () => {}).finally(() => { running = null })
  await job
}

let timer: ReturnType<typeof setTimeout> | undefined
/** 기록이 바뀐 뒤 몇 초 모았다가 동기화한다 (연달아 고칠 때 매번 돌지 않게) */
export function syncSoon(): void {
  clearTimeout(timer)
  timer = setTimeout(() => { void refreshCounts(); void syncNow() }, 3000)
}
