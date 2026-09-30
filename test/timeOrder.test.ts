import test from 'node:test'
import assert from 'node:assert/strict'
import { instantOf, newestFirst } from '../src/lib/timeOrder.ts'

test('instantOf: \'Z\'와 \'+09:00\'은 같은 순간이면 같은 값', () => {
  assert.equal(instantOf('2026-09-22T01:00:00+09:00'), instantOf('2026-09-21T16:00:00.000Z'))
  assert.equal(instantOf('2026-09-21T16:00:00.000Z'), Date.UTC(2026, 8, 21, 16, 0))
})

test('instantOf: 빈 값·못 읽는 값은 가장 옛것(-Infinity)', () => {
  for (const v of ['', 'not-a-date', null, undefined]) assert.equal(instantOf(v), -Infinity)
})

test('newestFirst: 글자가 아니라 순간으로 — 날짜 글자가 앞서도 실제로 이르면 뒤로', () => {
  // '2026-09-22T01:00:00+09:00'은 21일 16:00 UTC — 글자로는 22일이 앞서지만 21일 20:00 UTC보다 이르다
  const list = ['2026-09-22T01:00:00+09:00', '2026-09-21T20:00:00.000Z', '2026-09-21T10:00:00.000Z']
  assert.deepEqual([...list].sort(newestFirst), ['2026-09-21T20:00:00.000Z', '2026-09-22T01:00:00+09:00', '2026-09-21T10:00:00.000Z'])
  assert.equal([...list].sort((a, b) => b.localeCompare(a))[0], '2026-09-22T01:00:00+09:00', '옛 글자 비교는 이 경우 틀린다')
})

test('newestFirst: 같은 순간이면 원래 순서 그대로, 못 읽는 시각은 맨 뒤 (서로는 원래 순서)', () => {
  const same = [
    { id: 'first', at: '2026-09-21T16:00:00.000Z' },
    { id: 'bad-1', at: 'not-a-date' },
    { id: 'second', at: '2026-09-22T01:00:00+09:00' },
    { id: 'bad-2', at: '' },
    { id: 'newer', at: '2026-09-23T00:00:00.000Z' },
  ]
  const ids = (list: typeof same) => list.map((x) => x.id)
  assert.deepEqual(ids([...same].sort((a, b) => newestFirst(a.at, b.at))), ['newer', 'first', 'second', 'bad-1', 'bad-2'])
})

test('newestFirst: 뺄셈이 아니라서 NaN이 나오지 않는다', () => {
  assert.equal(newestFirst('x', 'y'), 0)
  assert.equal(newestFirst('2026-01-01T00:00:00.000Z', 'x'), -1)
  assert.equal(newestFirst('x', '2026-01-01T00:00:00.000Z'), 1)
})
