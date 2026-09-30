/**
 * 일지 목록을 만드는 순수 계산 — 최신순으로 늘어놓기, 검색어·"이름 미정" 칩으로 거르기, 이름 미정 수 세기, 달별로 묶기.
 * 화면(RecordsScreen)에서 뗐다 (작업 35) — 테스트를 붙이고, 뒤에 오는 기간·장소 거르기와 탐조 묶기가 같은 규칙을 쓰게.
 * 종 수 세기는 도감과 같이 쓰므로 `dex/speciesCount.ts`에 따로 둔다.
 */
// 확장자를 적는 이유: node --test가 이 파일을 직접 읽는다 (Vite는 어느 쪽이든 된다)
import { newestFirst } from '../../lib/timeOrder.ts'
import { monthOf } from '../../ui/when.ts'
import type { Sighting } from '../../types'

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
