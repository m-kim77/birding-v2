import type { Sighting } from '../types'
// node --test가 이 파일을 직접 읽는다 — 확장자를 적어야 node가 경로를 푼다
import { normalizeSighting } from './normalizeSighting.ts'

/**
 * 백업 파일의 모양. ZIP 안에 `journal.json` 하나와 `photos/<기록id>.<판>.jpg`들이 들어 있다.
 *
 * **가산 확장만 한다.** 새 정보는 새 키로 더하고, 있던 키의 뜻을 바꾸거나 지우지 않는다.
 * 읽을 때는 모르는 키를 남겨 두고 없는 키에 기본값을 채운다(`normalizeSighting`) — 그래야 옛 백업이 새 앱에서 열린다.
 * 이 파일은 DOM·IndexedDB를 쓰지 않는다 (node --test로 검사한다).
 */
export const BACKUP_FORMAT = 'bird-journal-backup'
export const BACKUP_VERSION = 1
export const JOURNAL_FILE = 'journal.json'

export interface BackupJournal {
  format: typeof BACKUP_FORMAT
  version: number
  exportedAt: string
  sightings: Sighting[]
}

/** 백업에 넣을 journal.json 내용을 만든다 */
export function buildJournal(sightings: Sighting[], now: Date): BackupJournal {
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now.toISOString(), sightings }
}

/** 읽어 들인 journal.json. 기록은 모두 맞춘 것이고, 맞출 수 없어 건너뛴 수가 따로 있다 */
export interface ParsedJournal extends BackupJournal {
  /** id나 읽을 수 있는 시각이 없어 건너뛴 기록 수 */
  skipped: number
}

/**
 * journal.json 글자를 읽어 검사한다.
 * 우리 백업이 아니거나(형식 표지 없음) 이 앱보다 새 버전이면 한국어 Error를 던진다 —
 * 새 버전의 파일을 옛 앱이 절반만 이해한 채 합치면 자료가 조용히 망가진다.
 * 기록은 하나씩 `normalizeSighting`으로 맞추고, 맞출 수 없는 것은 **그것만 건너뛴다** (2026-09-26 결정 —
 * 한 건 때문에 나머지 수백 건을 못 되살리면 안 된다). 같은 id가 두 번 나오면 뒤의 것은 건너뛴 수에 넣는다.
 */
export function parseJournal(text: string): ParsedJournal {
  let data: unknown
  try { data = JSON.parse(text) } catch { throw new Error('백업 파일을 읽을 수 없습니다 (내용이 깨졌습니다).') }
  const j = data as Partial<BackupJournal>
  if (j?.format !== BACKUP_FORMAT || !Array.isArray(j.sightings)) throw new Error('탐조일지 백업 파일이 아닙니다.')
  if (typeof j.version !== 'number' || j.version > BACKUP_VERSION) throw new Error('더 새로운 버전의 앱에서 만든 백업입니다. 앱을 새로 고친 뒤 다시 시도하세요.')
  const sightings: Sighting[] = []
  const seen = new Set<string>()
  for (const raw of j.sightings) {
    const s = normalizeSighting(raw)
    if (s && !seen.has(s.id)) { seen.add(s.id); sightings.push(s) }
  }
  return { format: BACKUP_FORMAT, version: j.version, exportedAt: typeof j.exportedAt === 'string' ? j.exportedAt : '', sightings, skipped: j.sightings.length - sightings.length }
}

export interface MergePlan {
  /** 지금 기기에 없던 기록 */
  add: Sighting[]
  /** 같은 id가 있고 백업 쪽이 더 최신인 기록 */
  update: Sighting[]
  /** 같은 id가 있고 기기 쪽이 같거나 더 최신이라 건드리지 않은 수 */
  kept: number
}

/**
 * 백업의 기록을 기기의 기록과 어떻게 합칠지 정한다. 같은 id는 `updatedAt`이 더 늦은 쪽이 이긴다.
 * **기기에만 있는 기록은 지우지 않는다** — 불러오기는 더하는 동작이지 되돌리는 동작이 아니다.
 * updatedAt은 UTC ISO('Z' 고정 폭)라 글자 비교가 곧 시각 비교다.
 */
export function planMerge(local: Sighting[], incoming: Sighting[]): MergePlan {
  const byId = new Map(local.map((s) => [s.id, s]))
  const plan: MergePlan = { add: [], update: [], kept: 0 }
  for (const s of incoming) {
    const mine = byId.get(s.id)
    if (!mine) plan.add.push(s)
    else if (s.updatedAt > mine.updatedAt) plan.update.push(s)
    else plan.kept += 1
  }
  return plan
}

/**
 * 백업 안의 사진 한 판을 기기에 넣을지 정한다.
 * - 갱신되는 기록(update)의 사진은 늘 넣는다 — 백업 쪽이 더 새 것이다.
 * - 그 밖에는 백업의 기록 목록에 든 기록 중 **기기에 그 판이 없을 때만** 넣는다.
 *   복원이 사진 도중에 끊기면 기록은 이미 다 들어가 있어서, 같은 파일을 다시 불러오면 planMerge가 전부 kept로 본다 —
 *   add·update만 보고 사진을 넣으면 그 사진은 영영 안 들어온다. "없으면 넣는다"로 두면 다시 불러오기가 곧 이어받기다.
 * - 백업의 기록 목록에 없는 id의 사진(주인 없는 사진)은 넣지 않는다.
 */
export function shouldCopyPhoto(id: string, plan: MergePlan, inJournal: boolean, alreadyHere: boolean): boolean {
  if (!inJournal) return false
  if (!alreadyHere) return true
  return plan.update.some((s) => s.id === id)
}

/** 사진의 ZIP 안 경로 */
export function photoPath(id: string, kind: string): string {
  return `photos/${id}.${kind}.jpg`
}

/** ZIP 안 경로에서 기록 id와 판을 되찾는다. 사진 경로가 아니면 null */
export function parsePhotoPath(path: string): { id: string; kind: string } | null {
  const m = /^photos\/([^/]+)\.(full|thumb|crop)\.jpg$/.exec(path)
  return m ? { id: m[1], kind: m[2] } : null
}
