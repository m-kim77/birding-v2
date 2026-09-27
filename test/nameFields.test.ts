import test from 'node:test'
import assert from 'node:assert/strict'
import { acceptsVerdict, nameFields } from '../src/features/record/nameFields.ts'
import type { Verdict } from '../src/types.ts'

/** 판정 하나. 바꿀 것만 넘긴다 */
function verdict(over: Partial<Verdict> = {}): Verdict {
  return { kind: '확정', speciesKo: '해오라기', latin: 'Nycticorax nycticorax', summary: '', evidence: [{ text: '근거', source: '위키백과' }], others: ['검은댕기해오라기'], model: 'm', ...over }
}

/** 이름이 붙는 시각 */
const NOW = new Date('2026-09-27T03:00:00.000Z')

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
  const f = nameFields('해오라기', verdict(), NOW)
  assert.equal(f.speciesKo, '해오라기')
  assert.equal(f.latin, 'Nycticorax nycticorax')
  assert.equal(f.verdict?.evidence.length, 1)
  assert.equal(f.identify, 'done')
})

test('이름이 판정과 다르면(직접 고친 이름·후보 이름) 학명은 종 표에서, 근거는 뗀다 — verdict 키는 남아 덮어쓴다', () => {
  const f = nameFields('박새', verdict(), NOW)
  assert.equal(f.latin, 'Parus minor')
  assert.ok('verdict' in f)
  assert.equal(f.verdict, undefined)
})

test('이름의 앞뒤 공백은 뗀다', () => {
  assert.equal(nameFields('  박새 ', null, NOW).speciesKo, '박새')
})

test('이름을 비우면 이름 미정 — 국명 없는 판정의 학명도 붙지 않고, 이름이 붙은 시각도 없다', () => {
  const f = nameFields(' ', verdict({ speciesKo: '', latin: 'Otus semitorques' }), NOW)
  assert.deepEqual(f, { speciesKo: '', latin: '', verdict: undefined, identify: 'none', namedAt: undefined })
})

test('이름이 붙은 시각: 새 기록·새 이름이면 지금 (도감 순서, dex/dexNo.ts)', () => {
  assert.equal(nameFields('까치', null, NOW).namedAt, NOW.toISOString())
  assert.equal(nameFields('까치', null, NOW, { speciesKo: '박새', namedAt: '2026-01-01T00:00:00.000Z' }).namedAt, NOW.toISOString())
})

test('저장한 기록을 고칠 때 이름이 그대로면 이름이 붙은 시각도 그대로 — 같은 이름을 다시 받아들여도 도감 번호가 뒤로 밀리지 않는다', () => {
  const current = { speciesKo: '까치', namedAt: '2026-01-01T00:00:00.000Z' }
  assert.equal(nameFields('까치', verdict({ speciesKo: '까치' }), NOW, current).namedAt, current.namedAt)
  // 옛 기록(시각 없음)도 그대로 둔다 — 도감은 만든 시각으로 센다
  assert.equal(nameFields('까치', null, NOW, { speciesKo: '까치' }).namedAt, undefined)
})
