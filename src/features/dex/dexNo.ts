import type { Sighting } from '../../types'

/**
 * 도감 번호와 "처음 본 종" 판단. 둘 다 새의 등급이 아니라 **내 기록의 사실**이다.
 * (등급은 2026-09-22에 뺐다. 등급 계산과 연출 판단은 사라졌고 번호만 옛 파일에서 옮겨 왔다.)
 *
 * **도감 번호는 저장하지 않고 볼 때마다 모든 기록으로 계산한다** (작업 29, 2026-09-27).
 * 전에는 새 종을 저장하는 순간 그 기기의 가장 큰 번호 + 1을 기록에 적었다. 그러면 드라이브·백업으로 기기 둘의 기록을 합칠 때
 * 두 기기가 각자 새 종에 같은 번호를 줘 다른 종이 같은 No.가 되고, 같은 종이 기기마다 다른 번호가 된다.
 * 계산하면 기록이 같은 기기끼리는 번호도 늘 같다. 대신 한 종의 기록을 모두 지우면 뒤 번호가 하나씩 당겨진다 (사용자 결정).
 */

/**
 * 이 기록이 도감 순서에서 쓰는 시각 (밀리초) — 지금 이름이 붙은 시각(`namedAt`), 없으면(옛 기록) 기록을 만든 시각.
 * 이름이 붙은 시각을 쓰는 이유: 이름 없이 저장했다가 나중에 이름을 붙이면 그 종은 도감에 **그때** 들어온 것이다.
 * 만든 시각을 쓰면 앞에 끼어들어 뒤 번호가 줄줄이 밀린다. 읽을 수 없는 시각이면 Infinity (맨 뒤).
 */
function enteredAt(s: Sighting): number {
  const at = Date.parse(s.namedAt ?? s.createdAt)
  return Number.isNaN(at) ? Infinity : at
}

/**
 * 모든 기록으로 종마다 도감 번호를 매긴다 — 그 종이 도감에 처음 들어온 순서대로 1, 2, 3 … (빈 번호 없음).
 * 이름 없는 기록은 세지 않는다. 같은 시각이면 이름의 글자 순으로 가른다 — 어느 기기·어느 순서로 읽어도 같은 답이어야 한다
 * (`localeCompare`는 브라우저마다 다를 수 있어 쓰지 않는다).
 */
export function dexNumbers(sightings: Sighting[]): Map<string, number> {
  const first = new Map<string, number>()
  for (const s of sightings) {
    if (!s.speciesKo) continue
    const at = enteredAt(s)
    const prev = first.get(s.speciesKo)
    if (prev === undefined || at < prev) first.set(s.speciesKo, at)
  }
  const order = [...first].sort(([nameA, a], [nameB, b]) => (a !== b ? (a < b ? -1 : 1) : nameA < nameB ? -1 : nameA > nameB ? 1 : 0))
  return new Map(order.map(([name], i) => [name, i + 1]))
}

/** 이 이름을 처음 기록하는지 (`existing`은 이 기록을 더하기 전의 목록). 이름이 없으면 false — 비교할 종이 없다 */
export function isFirstMeet(speciesKo: string, existing: Sighting[]): boolean {
  return speciesKo !== '' && !existing.some((s) => s.speciesKo === speciesKo)
}
