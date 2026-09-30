/**
 * 드라이브 동기화를 돌린다: 드라이브의 모습을 읽고 → 받을 것을 받고 → 줄의 일을 올린다 → (스위치를 켠 기기만) 이동 기록을 맞춘다.
 * 원본은 기기다. 여기서 무엇이 실패해도 기기의 기록은 그대로다 — 드라이브 쪽 일만 줄에 남아 다음에 다시 한다.
 *
 * 언제 도나: 앱을 열 때, 기록을 저장·고침·지운 뒤(몇 초 모아서), 도감을 열 때, 인터넷이 다시 붙을 때, 탭으로 돌아올 때,
 * 올릴 일이 남아 있으면 1분마다. 한 번에 하나만 돈다.
 */
import { NotConnectedError, connectDrive, disconnectDrive, loadDriveConfig } from '../lib/google/driveAuth'
import { DriveError } from '../lib/google/driveApi'
import type { Sighting } from '../types'
import { dbGet, dbGetAll, dbPut } from './db'
import { deleteSightingWithPhotos } from './photos'
import { afterFailure, dueEntries, planPull } from './syncPlan'
import { LAST_SYNC_KEY, finishEntry, isDriveLinked, listQueue, noteChange, saveFailure, setDriveLinked } from './syncQueue'
import { getSyncStatus, setSyncStatus } from './syncStatus'
import { clearDriveTracks, loadTracksSync, setTracksSyncOn, syncTracksStep } from './syncTracks'
import { pullRecord, pushEntry, readRemote, type Remote } from './syncTransfer'

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
  if (!navigator.onLine) { setSyncStatus({ phase: 'offline', message: '' }); return }
  setSyncStatus({ phase: 'syncing', message: '' })
  try {
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
  for (const id of plan.removeLocal) { await deleteSightingWithPhotos(id); changed = true }
  for (const id of plan.upload) await noteChange(id, 'put', true)
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
    setSyncStatus({ phase: 'offline' })
  }
}

/**
 * 구글로 로그인해 드라이브를 연결하고 곧바로 동기화한다 (처음이면 기기의 기록이 전부 올라가고, 다른 기기의 기록이 내려온다).
 * 사용자가 누른 순간에 불러야 한다 (로그인 창). 취소·실패는 한국어 Error로 던진다.
 */
export async function connect(): Promise<void> {
  await connectDrive(getSyncStatus().clientId)
  await setDriveLinked(true)
  setSyncStatus({ linked: true, phase: 'idle', message: '' })
  await loadTracksSync()
  await syncNow(true)
}

/**
 * 연결을 끊는다. 줄은 지우지 않는다 — 다시 연결하면 못 올린 일(특히 지운 기록)부터 이어서 한다.
 * 이동 기록 스위치는 끈다 — 다시 연결하는 계정이 다를 수 있어, 이동 기록은 다시 켜야 올린다 (드라이브의 사본은 그대로).
 * 로그인이 저절로 풀린 것(disconnected)은 끊은 것이 아니라 이 함수를 지나지 않는다 — 그때 스위치는 그대로다.
 */
export async function disconnect(): Promise<void> {
  await disconnectDrive()
  await setDriveLinked(false)
  await setTracksSyncOn(false)
  setSyncStatus({ linked: false, phase: 'idle', message: '' })
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
 */
export async function clearDriveTracksNow(): Promise<void> {
  while (running) await running
  const job = clearDriveTracks()
  running = job.then(() => {}, () => {}).finally(() => { running = null })
  await job
}

let timer: ReturnType<typeof setTimeout> | undefined
/** 기록이 바뀐 뒤 몇 초 모았다가 동기화한다 (연달아 고칠 때 매번 돌지 않게) */
export function syncSoon(): void {
  clearTimeout(timer)
  timer = setTimeout(() => { void refreshCounts(); void syncNow() }, 3000)
}
