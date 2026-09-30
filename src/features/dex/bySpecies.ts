/**
 * 도감의 종별 묶기 — 기록을 종마다 한 칸으로 모으고 도감 번호 순으로 늘어놓는다 (순수 계산).
 * 화면(DexScreen)에서 뗐다 (작업 35) — 테스트를 붙이려고. 번호 자체는 여기서 매기지 않고 `dexNo.ts`의 값을 받는다.
 */
import type { Sighting } from '../../types'

export interface SpeciesEntry {
  name: string
  /** 대표 카드 — 그 종의 가장 최근 기록 (등급이 없으니 "가장 좋은 기록"을 고를 기준이 없다. 최근 것이 대개 가장 잘 찍은 것이기도 하다) */
  best: Sighting
  /** 그 종의 모든 기록, 최근 것부터 */
  all: Sighting[]
}

/** 기록을 종별로 묶는다. 이름 없는 기록은 도감에 넣지 않는다. 도감 번호(`numbers` — dex/dexNo.ts의 계산값) 순으로 늘어놓는다 */
export function bySpecies(sightings: Sighting[], numbers: Map<string, number>): SpeciesEntry[] {
  const groups = new Map<string, Sighting[]>()
  for (const s of sightings) if (s.speciesKo) groups.set(s.speciesKo, [...(groups.get(s.speciesKo) ?? []), s])
  return [...groups.entries()].map(([name, list]) => {
    const all = [...list].sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))
    return { name, all, best: all[0] }
  }).sort((a, b) => (numbers.get(a.name) ?? 0) - (numbers.get(b.name) ?? 0))
}
