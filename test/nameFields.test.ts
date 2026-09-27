import test from 'node:test'
import assert from 'node:assert/strict'
import { acceptsVerdict, nameFields } from '../src/features/record/nameFields.ts'
import type { Sighting, Verdict } from '../src/types.ts'

/** 판정 하나. 바꿀 것만 넘긴다 */
function verdict(over: Partial<Verdict> = {}): Verdict {
  return { kind: '확정', speciesKo: '해오라기', latin: 'Nycticorax nycticorax', summary: '', evidence: [{ text: '근거', source: '위키백과' }], others: ['검은댕기해오라기'], model: 'm', ...over }
}

/** 도감 번호만 보는 다른 기록 (나머지 칸은 쓰지 않는다) */
function other(speciesKo: string, dexNo: number): Sighting {
  return { speciesKo, dexNo } as Sighting
}

test('acceptsVerdict: 판정의 국명이 이름(앞뒤 공백 뺌)과 같을 때만', () => {
  assert.equal(acceptsVerdict('해오라기', verdict()), true)
  assert.equal(acceptsVerdict('  해오라기 ', verdict()), true)
  assert.equal(acceptsVerdict('박새', verdict()), false)
  assert.equal(acceptsVerdict('해오라기', null), false)
})

test('acceptsVerdict: 국명을 확인하지 못한 판정은 빈 이름과도 짝이 되지 않는다 (작업 20)', () => {
  assert.equal(acceptsVerdict('', verdict({ speciesKo: '' })), false)
})

test('받아들인 판정은 AI의 학명과 근거를 가져간다', () => {
  const f = nameFields('해오라기', verdict(), [])
  assert.equal(f.speciesKo, '해오라기')
  assert.equal(f.latin, 'Nycticorax nycticorax')
  assert.equal(f.verdict?.evidence.length, 1)
  assert.equal(f.identify, 'done')
})

test('이름이 판정과 다르면(직접 고친 이름·후보 이름) 학명은 종 표에서, 근거는 뗀다 — verdict 키는 남아 덮어쓴다', () => {
  const f = nameFields('박새', verdict(), [])
  assert.equal(f.latin, 'Parus minor')
  assert.ok('verdict' in f)
  assert.equal(f.verdict, undefined)
})

test('이름의 앞뒤 공백은 뗀다', () => {
  assert.equal(nameFields('  박새 ', null, []).speciesKo, '박새')
})

test('이름을 비우면 이름 미정 — 국명 없는 판정의 학명도 붙지 않는다', () => {
  const f = nameFields(' ', verdict({ speciesKo: '', latin: 'Otus semitorques' }), [])
  assert.deepEqual(f, { speciesKo: '', latin: '', verdict: undefined, identify: 'none', dexNo: undefined })
})

test('도감 번호: 이미 본 종이면 그 번호, 처음 보는 종이면 다음 번호', () => {
  const others = [other('해오라기', 3), other('박새', 5)]
  assert.equal(nameFields('해오라기', null, others).dexNo, 3)
  assert.equal(nameFields('까치', null, others).dexNo, 6)
})

test('저장한 기록을 고칠 때 이름이 그대로면 도감 번호도 그대로 — 이 종의 기록이 그것뿐이어도 다음 번호로 바뀌지 않는다', () => {
  // 까치(4번)는 이 기록뿐이라 others에 없다. current 없이 매기면 6번이 된다
  const others = [other('해오라기', 3), other('박새', 5)]
  const current = { speciesKo: '까치', dexNo: 4 }
  assert.equal(nameFields('까치', verdict({ speciesKo: '까치' }), others, current).dexNo, 4)
  assert.equal(nameFields('까치', null, others).dexNo, 6)
  // 이름이 바뀌면 current가 있어도 다시 매긴다
  assert.equal(nameFields('해오라기', null, others, current).dexNo, 3)
})
