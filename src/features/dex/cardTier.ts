import type { CardTier, Sighting, Stamp } from '../../types'

/**
 * 카드 등급을 **무엇으로 나누는지**. 등급에 관한 결정은 이 파일에만 있다 — 기준을 바꿀 때 여기만 고친다.
 * (등급의 이름·색·별은 디자인에 속하므로 cardLook.ts에 있다.)
 *
 * 지금 기준(미확정): 1~3단계는 "나에게 얼마나 특별한가", 4단계만 객관적 사실(멸종위기·길잃은새)이다.
 * 외부 희귀도 자료 없이 내 기록만으로 계산된다. 카드에는 등급 이름(COMMON…)과 함께 **왜 그 등급인지**를 아래 말로 적는다 —
 * "희귀"라고만 쓰면 새 자체가 희귀하다는 뜻으로 읽히기 때문이다.
 */
export const TIER_REASONS: Record<CardTier, string> = {
  1: '다시 만남',
  2: '올해 첫 만남',
  3: '첫 만남',
  4: '귀한 손님',
}

/**
 * 새 기록의 카드 등급을 정한다. `existing`은 이 기록을 더하기 전의 목록이다.
 * 이름이 없는 기록(판정 대기)은 비교할 종이 없으므로 1단계.
 */
export function tierFor(speciesKo: string, capturedAt: string, stamps: Stamp[], existing: Sighting[]): CardTier {
  if (!speciesKo) return 1
  if (stamps.includes('멸종위기') || stamps.includes('길잃은새')) return 4
  const same = existing.filter((s) => s.speciesKo === speciesKo)
  if (same.length === 0) return 3
  const year = capturedAt.slice(0, 4)
  return same.some((s) => s.capturedAt.startsWith(year)) ? 1 : 2
}

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

/** 등장 연출을 보여 줄지. 매번 나오면 귀찮아지므로 처음 본 종과 귀한 손님에만 */
export function shouldReveal(tier: CardTier): boolean {
  return tier >= 3
}
