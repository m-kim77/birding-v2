/**
 * AI 판정을 기록에 넣는 규칙 한 곳 — 이름과 판정으로 기록의 이름 칸들(국명·학명·근거·판정 상태·이름이 붙은 시각)을 정한다.
 * 새 기록(buildSighting)·수정(records/editPatch)·상세의 '이 이름으로'와 후보 고르기(records/DetailIdentify)가 함께 쓴다.
 * 규칙이 한 곳에 있어야 "직접 고친 이름에 AI 근거가 붙는" 거짓이 어느 길에서도 생기지 않는다. 순수 함수다 (node --test로 검사한다).
 */
// 확장자를 적는 이유: node --test가 이 파일을 직접 읽는다 (Vite는 어느 쪽이든 된다)
import { latinOf } from '../../data/species.ts'
import type { Sighting, Verdict } from '../../types'

/** 기록에서 이름에 딸린 칸들. `verdict`·`namedAt` 키는 늘 있다 — 떼야 할 때 undefined로 덮어야 옛 값이 남지 않는다 */
export type NameFields = Pick<Sighting, 'speciesKo' | 'latin' | 'verdict' | 'identify' | 'namedAt'>

/**
 * 이 이름으로 저장하면 판정을 받아들이는지 — 판정의 국명이 이름(앞뒤 공백 뺌)과 같을 때만.
 * 국명을 확인하지 못한 판정(`speciesKo`가 빈 것)은 받아들일 이름이 없다 (작업 20). 판정이 없으면 false.
 */
export function acceptsVerdict(name: string, verdict: Verdict | null): boolean {
  return verdict !== null && verdict.speciesKo !== '' && verdict.speciesKo === name.trim()
}

/**
 * 이름과 판정으로 기록의 이름 칸들을 정한다.
 * - 이름은 앞뒤 공백을 뗀다. 비면 '이름 미정'(identify 'none', 이름이 붙은 시각 없음 — 도감에 들지 않는다).
 * - 판정을 받아들이면(acceptsVerdict) AI의 학명과 근거가 따라간다. 아니면 학명은 종 표에서 찾고 근거는 뗀다 —
 *   직접 고친 이름이나 후보 이름에 AI 근거를 붙이면 거짓이 된다 (근거는 그 판정의 국명에 대한 것이다).
 * - 이름이 붙은 시각(`namedAt`)은 `now` — 도감 번호의 순서가 이것으로 정해진다 (dex/dexNo.ts, 번호 자체는 저장하지 않는다).
 *   저장한 기록을 고칠 때는 `current`(그 기록의 지금 이름·시각)를 넘긴다 — 이름이 그대로면 시각도 그대로 둔다.
 *   같은 이름을 다시 받아들였다고 시각을 바꾸면, 이 종의 기록이 그것뿐일 때 도감 번호가 뒤로 밀린다.
 */
export function nameFields(name: string, verdict: Verdict | null, now: Date, current?: Pick<Sighting, 'speciesKo' | 'namedAt'>): NameFields {
  const speciesKo = name.trim()
  const accepted = verdict && acceptsVerdict(speciesKo, verdict) ? verdict : null
  const namedAt = !speciesKo ? undefined : current && current.speciesKo === speciesKo ? current.namedAt : now.toISOString()
  return {
    speciesKo, latin: accepted ? accepted.latin : latinOf(speciesKo), verdict: accepted ?? undefined,
    identify: speciesKo ? 'done' : 'none', namedAt,
  }
}
