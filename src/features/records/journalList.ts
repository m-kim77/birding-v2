/**
 * 일지 목록을 만드는 순수 계산 — 최신순으로 늘어놓기, 검색어·"이름 미정" 칩으로 거르기, 이름 미정 수 세기, 달별·탐조 묶음별로 나누기.
 * 탐조 묶음 자체는 outings.ts가 모든 기록으로 계산하고, 여기서는 보일 기록을 그 묶음에 맞춰 덩어리로 나누기만 한다 (monthSections).
 * 화면(RecordsScreen)에서 뗐다 (작업 35) — 테스트를 붙이고, 뒤에 오는 기간·장소 거르기와 탐조 묶기가 같은 규칙을 쓰게.
 * 종 수 세기는 도감과 같이 쓰므로 `dex/speciesCount.ts`에 따로 둔다.
 */
// 확장자를 적는 이유: node --test가 이 파일을 직접 읽는다 (Vite는 어느 쪽이든 된다)
import { newestFirst } from '../../lib/timeOrder.ts'
import { monthOf } from '../../ui/when.ts'
import type { Sighting } from '../../types'
import type { Outing } from './outings'

/**
 * 검색어가 종 이름·학명·장소·메모 중 어디든 들어 있으면 남긴다. 빈 검색어는 전부 통과 (메모는 개체 수·행동을 적으라고 만든 칸이라 같이 찾는다).
 * 옛 백업에서 온 기록은 키가 비어 있을 수 있어 `?? ''`로 받는다 — 검색하다 화면이 죽으면 안 된다.
 */
export function matchesQuery(s: Sighting, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [s.speciesKo, s.latin, s.place, s.note].some((v) => (v ?? '').toLowerCase().includes(q))
}

/**
 * 촬영 시각의 최신순으로 늘어놓은 새 배열. 입력 배열은 바꾸지 않는다 (journal의 목록을 그대로 정렬하면 다른 화면의 순서까지 바뀐다).
 * 글자가 아니라 순간으로 견준다 (lib/timeOrder.ts) — 같은 순간이면 입력 순서 그대로, 못 읽는 시각은 맨 뒤.
 */
export function sortNewest(list: Sighting[]): Sighting[] {
  return [...list].sort((a, b) => newestFirst(a.capturedAt, b.capturedAt))
}

/** 이름이 아직 없는 기록("이름 미정")의 수. "이름 미정 N건" 칩이 쓴다 — 0이면 칩을 그리지 않는다 */
export function countUnnamed(list: Sighting[]): number {
  return list.filter((s) => !s.speciesKo).length
}

/**
 * 목록에 보일 기록 — 검색어에 맞고, "이름 미정" 칩이 켜져 있으면 이름 없는 기록만. 입력의 순서를 그대로 둔다.
 * 맞는 것이 없으면 빈 배열 (화면이 "맞는 기록이 없습니다"를 띄운다).
 */
export function shownRecords(list: Sighting[], query: string, onlyUnnamed: boolean): Sighting[] {
  return list.filter((s) => matchesQuery(s, query) && (!onlyUnnamed || !s.speciesKo))
}

/** 달별로 묶는다. 입력이 최신순이면 결과도 최신 달부터 나온다 */
export function groupByMonth(list: Sighting[]): Array<[string, Sighting[]]> {
  const groups = new Map<string, Sighting[]>()
  for (const s of list) {
    const key = monthOf(s)
    groups.set(key, [...(groups.get(key) ?? []), s])
  }
  return [...groups.entries()]
}

/** 달 제목 아래의 한 덩어리 — 탐조 묶음(두 건 이상) 하나의 보일 기록, 또는 이어진 한 건짜리 기록들 */
export interface ListBlock {
  /** 머리줄을 얹을 탐조 묶음. null이면 머리줄 없이 기록만 (한 건짜리 묶음들) */
  outing: Outing | null
  /** 이 덩어리에 보일 기록 — 보일 기록(`shown`)의 순서 그대로. 늘 한 건 이상 */
  items: Sighting[]
}

/** 일지의 달 하나 — 달 제목과 그 아래 덩어리들 */
export interface MonthSection {
  /** '2026년 9월' (ui/when.ts monthOf) */
  month: string
  blocks: ListBlock[]
}

/**
 * 달 안의 기록을 덩어리로 — 같은 탐조 묶음(두 건 이상)의 이어진 기록은 머리줄 덩어리 하나로, 한 건짜리 묶음의 이어진 기록은
 * 머리줄 없는 덩어리 하나로 모은다. 한 건짜리에 머리줄을 달면 바로 아래 칸과 같은 말(날짜·장소)이 두 번 나오고,
 * 한 건짜리마다 격자를 따로 그리면 PC 너비에서 카드가 한 줄에 하나씩 놓인다.
 */
function blocksOf(list: Sighting[], outingOf: Map<string, Outing>): ListBlock[] {
  const blocks: ListBlock[] = []
  for (const s of list) {
    const o = outingOf.get(s.id)
    const outing = o && o.items.length >= 2 ? o : null
    const last = blocks[blocks.length - 1]
    if (last && last.outing === outing) last.items.push(s)
    else blocks.push({ outing, items: [s] })
  }
  return blocks
}

/**
 * 일지 목록의 모양 — 달별로 묶고(groupByMonth), 달 안에서는 탐조 묶음마다 덩어리로 나눈다 (blocksOf). `shown`의 순서는 바꾸지 않는다.
 * `outings`는 **모든 기록**으로 계산한 것이다 (outings.ts outingsOf) — 검색·거르기로 한 건만 보여도 그 묶음의 머리줄과 전체 숫자가 나온다.
 * 한 탐조는 한 날짜라 달을 넘지 않는다. `outings`에 없는 기록(있으면 안 되지만)은 한 건짜리로 친다. 보일 기록이 없으면 빈 배열.
 * 같은 순간(밀리초까지)에 서로 먼 두 곳에서 찍힌 기록만 최신순(입력 순서)과 묶음(id 순)의 줄이 엇갈려 같은 머리줄이 두 번 나올 수 있다 — 자료는 그대로다.
 */
export function monthSections(shown: Sighting[], outings: Outing[]): MonthSection[] {
  const outingOf = new Map<string, Outing>()
  for (const o of outings) for (const s of o.items) outingOf.set(s.id, o)
  return groupByMonth(shown).map(([month, list]) => ({ month, blocks: blocksOf(list, outingOf) }))
}
