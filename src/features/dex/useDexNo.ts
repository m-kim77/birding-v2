import { useJournal } from '../../data/journal'
import type { Sighting } from '../../types'
import { dexNumbers } from './dexNo'

/**
 * 기록 목록마다 한 번만 계산해 둔다. 도감 격자는 카드 수십 장이 저마다 번호를 묻는다 — 카드마다 전체를 다시 세지 않게.
 * 기록이 바뀌면 목록 배열이 새로 만들어지므로(journal.tsx) 옛 계산은 저절로 버려진다.
 */
const cache = new WeakMap<Sighting[], Map<string, number>>()

/** 지금 기록들로 매긴 종별 도감 번호 (dex/dexNo.ts dexNumbers). 기록을 아직 읽는 중이면 빈 표 */
export function useDexNumbers(): Map<string, number> {
  const { sightings } = useJournal()
  if (!sightings) return new Map()
  let numbers = cache.get(sightings)
  if (!numbers) {
    numbers = dexNumbers(sightings)
    cache.set(sightings, numbers)
  }
  return numbers
}

/** 이 종의 도감 번호. 이름이 없거나 아직 기록에 없는 종이면 undefined (카드에는 'No. —') */
export function useDexNo(speciesKo: string): number | undefined {
  const numbers = useDexNumbers()
  return speciesKo ? numbers.get(speciesKo) : undefined
}
