import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSighting } from '../src/features/record/buildSighting.ts'
import type { Verdict } from '../src/types.ts'

/** 판정 하나. 바꿀 것만 넘긴다 */
function verdict(over: Partial<Verdict> = {}): Verdict {
  return { kind: '확정', speciesKo: '해오라기', latin: 'Nycticorax nycticorax', summary: '', evidence: [{ text: '근거', source: '위키백과' }], others: [], model: 'm', ...over }
}

/** 기록 하나를 만든다. 이름과 판정(과 개체 수)만 바꿔 본다 */
function build(name: string, v: Verdict | null, over: { count?: number } = {}) {
  return buildSighting({
    name, note: '', exif: {}, place: { lat: null, lng: null, name: '', source: 'none' }, crop: null, verdict: v,
    cardStyle: { accent: '#000000', glow: false }, now: new Date('2026-09-27T00:00:00Z'), ...over,
  })
}

test('AI의 국명을 그대로 받아들이면 AI의 학명과 근거가 남는다', () => {
  const s = build('해오라기', verdict())
  assert.equal(s.latin, 'Nycticorax nycticorax')
  assert.equal(s.verdict?.evidence.length, 1)
  assert.equal(s.identify, 'done')
})

test('이름을 직접 고치면 AI 근거를 붙이지 않고 학명은 종 표에서 찾는다', () => {
  const s = build('박새', verdict())
  assert.equal(s.verdict, undefined)
  assert.equal(s.latin, 'Parus minor')
})

test('국명을 확인하지 못한 판정은 이름 없이 저장해도 학명·근거가 붙지 않는다 (작업 20)', () => {
  const s = build('', verdict({ speciesKo: '', latin: 'Otus semitorques' }))
  assert.equal(s.speciesKo, '')
  assert.equal(s.latin, '')
  assert.equal(s.verdict, undefined)
  assert.equal(s.identify, 'none')
})

test('학명을 이름 칸에 직접 적어도 AI 판정으로 치지 않는다 (예전에는 학명이 같으면 받아들인 것으로 봤다)', () => {
  const s = build('Otus semitorques', verdict({ speciesKo: '', latin: 'Otus semitorques' }))
  assert.equal(s.speciesKo, 'Otus semitorques')
  assert.equal(s.verdict, undefined)
})

test('새 기록에는 이름이 붙은 시각(도감 순서)을 적고, 도감 번호는 적지 않는다 — 번호는 볼 때 계산한다 (작업 29)', () => {
  const s = build('해오라기', null)
  assert.equal(s.namedAt, '2026-09-27T00:00:00.000Z')
  assert.ok(!('dexNo' in s))
  assert.equal(build('', null).namedAt, undefined)
})

test('개체 수는 세었을 때만 키가 생긴다 — 안 셌으면 키가 없다(1을 채우지 않는다) (작업 39)', () => {
  assert.ok(!('count' in build('박새', null)))
  assert.equal(build('박새', null, { count: 3 }).count, 3)
  assert.ok(!('count' in build('박새', null, { count: 0 })), '개체 수로 읽히지 않는 값은 넣지 않는다')
})
