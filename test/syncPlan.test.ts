import test from 'node:test'
import assert from 'node:assert/strict'
import { MAX_TRIES, afterFailure, dueEntries, planPull, queueChange, remoteRecordOf, type QueueEntry, type RemoteRecord } from '../src/data/syncPlan.ts'
import type { Sighting } from '../src/types.ts'

const T0 = new Date('2026-09-27T00:00:00.000Z')
const later = (s: number) => new Date(T0.getTime() + s * 1000)
/** 검사에 필요한 값만 채운 기록 */
const s = (id: string, updatedAt: string) => ({ id, updatedAt }) as Sighting
const r = (id: string, updatedAt: string, deleted = false): RemoteRecord => ({ id, fileId: `f-${id}`, updatedAt, deleted })

test('queueChange: 새 일이 앞 일을 덮고, 앞 일의 "사진도 올리기"는 잃지 않는다', () => {
  const added = queueChange(undefined, 'a', 'put', true, T0)
  const renamed = queueChange(added, 'a', 'put', false, later(1))
  assert.equal(renamed.photos, true)
  assert.equal(renamed.at, later(1).toISOString())
  assert.equal(queueChange(undefined, 'a', 'put', false, T0).photos, false)
})

test('queueChange: 지우기가 올리기를 덮는다, 실패 횟수·멈춤은 새 일에서 지워진다', () => {
  const failed = { ...afterFailure(queueChange(undefined, 'a', 'put', true, T0), '끊김', T0), stuck: true }
  const removed = queueChange(failed, 'a', 'delete', false, later(5))
  assert.deepEqual([removed.op, removed.photos, removed.tries, removed.stuck], ['delete', false, 0, false])
})

test('afterFailure: 간격을 늘려 가다가 정해진 횟수에서 멈춘다 (무한히 돌지 않는다)', () => {
  let e: QueueEntry = queueChange(undefined, 'a', 'put', true, T0)
  e = afterFailure(e, 'x', T0)
  assert.equal(e.nextAt, later(30).toISOString())
  assert.equal(e.stuck, false)
  for (let i = 1; i < MAX_TRIES; i++) e = afterFailure(e, 'x', T0)
  assert.equal(e.tries, MAX_TRIES)
  assert.equal(e.stuck, true)
  assert.equal(e.lastError, 'x')
})

test('dueEntries: 자동은 때가 된 것만(멈춘 것 제외), 누르면 전부 — 먼저 생긴 일부터', () => {
  const a = queueChange(undefined, 'a', 'put', true, later(2))
  const b = afterFailure(queueChange(undefined, 'b', 'put', true, T0), 'x', T0) // 30초 뒤에 다시
  const c = { ...queueChange(undefined, 'c', 'put', true, T0), stuck: true }
  assert.deepEqual(dueEntries([a, b, c], later(10), false).map((e) => e.id), ['a'])
  assert.deepEqual(dueEntries([a, b, c], later(40), false).map((e) => e.id), ['b', 'a'])
  assert.deepEqual(dueEntries([a, b, c], later(10), true).map((e) => e.id), ['b', 'c', 'a'])
})

test('planPull: 더 새 쪽이 이긴다 — 드라이브가 새것이면 받고, 기기가 새것이면 올린다, 같으면 그대로', () => {
  const plan = planPull(
    [s('a', '2026-09-02'), s('b', '2026-09-05'), s('c', '2026-09-03')],
    [r('a', '2026-09-03'), r('b', '2026-09-04'), r('c', '2026-09-03')],
    new Set(),
  )
  assert.deepEqual(plan.download.map((x) => x.id), ['a'])
  assert.deepEqual(plan.upload, ['b'])
  assert.deepEqual(plan.removeLocal, [])
})

test('planPull: 한쪽에만 있는 기록 — 드라이브에만 있으면 받고, 기기에만 있으면 올린다 (처음 연결할 때 전부 올라간다)', () => {
  const plan = planPull([s('mine', '2026-09-01')], [r('theirs', '2026-09-01')], new Set())
  assert.deepEqual(plan.download.map((x) => x.id), ['theirs'])
  assert.deepEqual(plan.upload, ['mine'])
})

test('planPull: 다른 기기에서 지운 기록은 여기서도 지운다 — 그 뒤에 여기서 고쳤으면 지우지 않고 다시 올린다', () => {
  const plan = planPull(
    [s('gone', '2026-09-01'), s('edited', '2026-09-09')],
    [r('gone', '2026-09-05', true), r('edited', '2026-09-05', true), r('never-here', '2026-09-05', true)],
    new Set(),
  )
  assert.deepEqual(plan.removeLocal, ['gone'])
  assert.deepEqual(plan.upload, ['edited'])
  assert.deepEqual(plan.download, []) // 지움 표시만 있는 기록은 받지 않는다
})

test('planPull: 줄에 남은 일(여기서 지웠는데 아직 못 올린 것 등)은 드라이브 쪽으로 되돌리지 않는다', () => {
  // 여기서 지운 기록: 기기에는 없고 드라이브에는 아직 살아 있다 — 받으면 지운 기록이 되살아난다
  const plan = planPull([s('edited', '2026-09-01')], [r('deleted-here', '2026-09-01'), r('edited', '2026-09-09')], new Set(['deleted-here', 'edited']))
  assert.deepEqual(plan, { download: [], removeLocal: [], upload: [] })
})

test('remoteRecordOf: 우리 모양의 파일만 읽는다', () => {
  assert.deepEqual(remoteRecordOf({ id: 'f1', name: 'abc.json', appProperties: { updatedAt: 'T', deleted: '1' } }), { id: 'abc', fileId: 'f1', updatedAt: 'T', deleted: true })
  assert.equal(remoteRecordOf({ id: 'f2', name: 'notes.txt', appProperties: { updatedAt: 'T' } }), null)
  assert.equal(remoteRecordOf({ id: 'f3', name: 'abc.json' }), null) // 꼬리표 없음 — 사람이 넣은 파일
})
