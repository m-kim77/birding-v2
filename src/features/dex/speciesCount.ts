/**
 * 종 수 세기 — 일지 요약 줄("기록 N건 · M종 · 올해 K종")과 도감의 "올해" 칩이 쓴다. 무엇을 한 종으로 치는지는 도감의 규칙이라 dex 폴더에 둔다.
 * 이름이 없는 기록("이름 미정")은 어느 종인지 모르므로 세지 않는다 — 도감에 들어가지 않는 것과 같은 규칙이다. 이름이 있으면 사진이 없어도 센다.
 * "올해"는 **촬영지 시각**의 해다 (ui/when.ts yearMonthOf — 일지의 달 제목과 같은 기준). 옛 사진을 올해 넣어도 올해 본 새가 되지 않는다.
 */
// 확장자를 적는 이유: node --test가 이 파일을 직접 읽는다 (Vite는 어느 쪽이든 된다)
import { yearMonthOf } from '../../ui/when.ts'
import type { Sighting } from '../../types'

/** 이름이 있는 기록의 서로 다른 종 수. 같은 종의 기록 여럿은 한 종이고, 기록이 없거나 전부 이름 미정이면 0 */
export function countSpecies(list: Sighting[]): number {
  return new Set(list.filter((s) => s.speciesKo).map((s) => s.speciesKo)).size
}

/**
 * 그 해(촬영지 시각)에 만난 종의 이름들 — 이름 있는 기록만. 시각을 못 읽는 기록은 어느 해에도 넣지 않는다.
 * 해는 부르는 쪽이 넘긴다 — 이 함수는 시계를 읽지 않는다 (테스트가 오늘 날짜에 매이지 않게). 없으면 빈 Set.
 */
export function speciesInYear(list: Sighting[], year: number): Set<string> {
  return new Set(list.filter((s) => s.speciesKo && yearMonthOf(s)?.year === year).map((s) => s.speciesKo))
}

/** 일지 요약 줄의 종 셈 */
export interface YearTally {
  /** 모든 기록의 종 수 (countSpecies) */
  total: number
  /** 그 해에 만난 종 수 */
  inYear: number
  /** 이름 있는 기록 가운데 그 해가 아닌 것(시각을 못 읽는 것 포함)이 있나 — 없으면 "올해 K종"은 앞의 "M종"과 같은 말이다 */
  otherYears: boolean
}

/** 전체 종 수와 그 해의 종 수를 한 번에 센다. 기록이 없으면 { 0, 0, false } */
export function yearTally(list: Sighting[], year: number): YearTally {
  return {
    total: countSpecies(list),
    inYear: speciesInYear(list, year).size,
    otherYears: list.some((s) => s.speciesKo && yearMonthOf(s)?.year !== year),
  }
}
