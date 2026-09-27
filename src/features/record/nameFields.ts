/**
 * AI 판정을 기록에 넣는 규칙 한 곳 — 이름과 판정으로 기록의 이름 칸들(국명·학명·근거·판정 상태·도감 번호)을 정한다.
 * 새 기록(buildSighting)·수정(records/editPatch)·상세의 '이 이름으로'와 후보 고르기(records/DetailIdentify)가 함께 쓴다.
 * 규칙이 한 곳에 있어야 "직접 고친 이름에 AI 근거가 붙는" 거짓이 어느 길에서도 생기지 않는다. 순수 함수다 (node --test로 검사한다).
 */
// 확장자를 적는 이유: node --test가 이 파일을 직접 읽는다 (Vite는 어느 쪽이든 된다)
import { latinOf } from '../../data/species.ts'
import type { Sighting, Verdict } from '../../types'
import { dexNoFor } from '../dex/dexNo.ts'

/** 기록에서 이름에 딸린 칸들. `verdict` 키는 늘 있다 — 떼야 할 때 undefined로 덮어야 옛 근거가 남지 않는다 */
export type NameFields = Pick<Sighting, 'speciesKo' | 'latin' | 'verdict' | 'identify' | 'dexNo'>

/**
 * 이 이름으로 저장하면 판정을 받아들이는지 — 판정의 국명이 이름(앞뒤 공백 뺌)과 같을 때만.
 * 국명을 확인하지 못한 판정(`speciesKo`가 빈 것)은 받아들일 이름이 없다 (작업 20). 판정이 없으면 false.
 */
export function acceptsVerdict(name: string, verdict: Verdict | null): boolean {
  return verdict !== null && verdict.speciesKo !== '' && verdict.speciesKo === name.trim()
}

/**
 * 이름과 판정으로 기록의 이름 칸들을 정한다.
 * - 이름은 앞뒤 공백을 뗀다. 비면 '이름 미정'(identify 'none', 도감 번호 없음).
 * - 판정을 받아들이면(acceptsVerdict) AI의 학명과 근거가 따라간다. 아니면 학명은 종 표에서 찾고 근거는 뗀다 —
 *   직접 고친 이름이나 후보 이름에 AI 근거를 붙이면 거짓이 된다 (근거는 그 판정의 국명에 대한 것이다).
 * - 도감 번호는 `others`(이 기록을 뺀 기록들)로 매긴다 — 이미 본 종이면 그 번호, 처음 보는 종이면 다음 번호.
 */
export function nameFields(name: string, verdict: Verdict | null, others: Sighting[]): NameFields {
  const speciesKo = name.trim()
  const accepted = verdict && acceptsVerdict(speciesKo, verdict) ? verdict : null
  return {
    speciesKo, latin: accepted ? accepted.latin : latinOf(speciesKo), verdict: accepted ?? undefined,
    identify: speciesKo ? 'done' : 'none', dexNo: dexNoFor(speciesKo, others),
  }
}
