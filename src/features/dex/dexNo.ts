import type { Sighting } from '../../types'

/**
 * 도감 번호와 "처음 본 종" 판단. 둘 다 새의 등급이 아니라 **내 기록의 사실**이다.
 * (등급은 2026-09-22에 뺐다. 등급 계산과 연출 판단은 사라졌고 dexNoFor만 옛 파일에서 옮겨 왔다.)
 */

/**
 * 새 기록의 도감 번호. 이미 본 종이면 그 종의 번호를 그대로 쓰고, 처음 본 종이면 다음 번호를 받는다.
 * 이름 없는 기록은 번호가 없다 (undefined). 번호는 기록에 저장된다 — 나중에 앞의 기록을 지워도 남은 번호가 바뀌지 않는다.
 */
export function dexNoFor(speciesKo: string, existing: Sighting[]): number | undefined {
  if (!speciesKo) return undefined
  const same = existing.find((s) => s.speciesKo === speciesKo && s.dexNo)
  if (same) return same.dexNo
  return Math.max(0, ...existing.map((s) => s.dexNo ?? 0)) + 1
}

/** 이 이름을 처음 기록하는지 (`existing`은 이 기록을 더하기 전의 목록). 이름이 없으면 false — 비교할 종이 없다 */
export function isFirstMeet(speciesKo: string, existing: Sighting[]): boolean {
  return speciesKo !== '' && !existing.some((s) => s.speciesKo === speciesKo)
}
