/**
 * 종 수 세기 — 일지 요약 줄("기록 N건 · M종")이 쓴다. 무엇을 한 종으로 치는지는 도감의 규칙이라 dex 폴더에 둔다.
 * 이름이 없는 기록("이름 미정")은 어느 종인지 모르므로 세지 않는다 — 도감에 들어가지 않는 것과 같은 규칙이다.
 */
import type { Sighting } from '../../types'

/** 이름이 있는 기록의 서로 다른 종 수. 같은 종의 기록 여럿은 한 종이고, 기록이 없거나 전부 이름 미정이면 0 */
export function countSpecies(list: Sighting[]): number {
  return new Set(list.filter((s) => s.speciesKo).map((s) => s.speciesKo)).size
}
