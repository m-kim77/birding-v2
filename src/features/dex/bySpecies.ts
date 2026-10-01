/**
 * 도감의 종별 묶기 — 기록을 종마다 한 칸으로 모으고 도감 번호 순으로 늘어놓는다 (순수 계산).
 * 화면(DexScreen)에서 뗐다 (작업 35) — 테스트를 붙이려고. 번호 자체는 여기서 매기지 않고 `dexNo.ts`의 값을 받는다.
 */
// 확장자를 적는 이유: node --test가 이 파일을 직접 읽는다 (Vite는 어느 쪽이든 된다)
import { newestFirst } from '../../lib/timeOrder.ts'
// 확장자를 적는 이유: 위와 같다 — node --test가 이 파일을 거쳐 photoKey.ts도 읽는다
import { expectsPhoto } from '../../data/photoKey.ts'
import type { Sighting } from '../../types'

export interface SpeciesEntry {
  name: string
  /**
   * 대표 카드 — 그 종의 사진 있는 기록 가운데 가장 최근 것, 사진 있는 기록이 없으면 가장 최근 기록
   * (등급이 없으니 "가장 좋은 기록"을 고를 기준이 없다. 최근 것이 대개 가장 잘 찍은 것이기도 하다).
   * 사진 있는 기록을 먼저 고르는 것은 사진 없이 남긴 기록이 나중에 생겨도 도감 칸이 빈 자리 표시로 바뀌지 않게 (작업 39).
   */
  best: Sighting
  /** 그 종의 모든 기록, 최근 것부터 */
  all: Sighting[]
}

/**
 * 기록을 종별로 묶는다. 이름 없는 기록은 도감에 넣지 않는다 (사진 없이 남긴 기록도 이름이 있으면 넣는다). 도감 번호(`numbers` — dex/dexNo.ts의 계산값) 순으로 늘어놓는다.
 * 종 안의 "최근"은 글자가 아니라 순간으로 가린다 (lib/timeOrder.ts) — 같은 순간이면 입력 순서, 못 읽는 시각은 맨 뒤.
 * 사진이 있어야 하는 기록인지는 data/photoKey.ts expectsPhoto 한 곳에 묻는다 (소리 기록·사진 없이 남긴 기록은 뒤로).
 */
export function bySpecies(sightings: Sighting[], numbers: Map<string, number>): SpeciesEntry[] {
  const groups = new Map<string, Sighting[]>()
  for (const s of sightings) if (s.speciesKo) groups.set(s.speciesKo, [...(groups.get(s.speciesKo) ?? []), s])
  return [...groups.entries()].map(([name, list]) => {
    const all = [...list].sort((a, b) => newestFirst(a.capturedAt, b.capturedAt))
    return { name, all, best: all.find(expectsPhoto) ?? all[0] }
  }).sort((a, b) => (numbers.get(a.name) ?? 0) - (numbers.get(b.name) ?? 0))
}
