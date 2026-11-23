import test from 'node:test'
import assert from 'node:assert/strict'
import { MAX_TRIES, accountDecision, afterFailure, askedAccountOf, dueEntries, isDue, keepsTombstones, nextDueAt, planPull, queueChange, recordTags, remoteRecordOf, shouldPushRecord, shouldPushTombstone, type QueueEntry, type RemoteRecord } from '../src/data/syncPlan.ts'
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

test('nextDueAt · isDue: 1분 타이머는 멈추지 않았고 재시도 시각이 지난 항목이 있을 때만 돈다', () => {
  const stuck = { ...queueChange(undefined, 'c', 'put', true, T0), stuck: true }
  const waiting = afterFailure(queueChange(undefined, 'b', 'put', true, T0), 'x', T0) // 30초 뒤에 다시
  // 멈춘 항목만 남았다 — 드라이브가 꽉 차 다섯 번 실패한 뒤. 매분 목록 전체를 받지 않는다
  assert.equal(nextDueAt([stuck]), '')
  assert.equal(isDue(nextDueAt([stuck]), later(600)), false)
  assert.equal(isDue(nextDueAt([]), later(600)), false)
  // 재시도를 기다리는 항목은 그 시각이 지나야 돈다
  assert.equal(nextDueAt([stuck, waiting]), later(30).toISOString())
  assert.equal(isDue(nextDueAt([stuck, waiting]), later(10)), false)
  assert.equal(isDue(nextDueAt([stuck, waiting]), later(30)), true)
  // 가장 이른 것을 본다 — dueEntries가 자동으로 올리는 항목과 같다
  const fresh = queueChange(undefined, 'a', 'put', true, later(5))
  assert.equal(nextDueAt([waiting, fresh, stuck]), later(5).toISOString())
  assert.deepEqual(dueEntries([waiting, fresh, stuck], later(5), false).map((e) => e.id), ['a'])
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

test('planPull: 줄에 남은 고침도 드라이브의 지움보다 먼저면 지운다 — 늦은 쪽이 이긴다 (지움 뒤의 고침은 남아 올라간다)', () => {
  const plan = planPull(
    [s('edited-before', '2026-09-05'), s('edited-after', '2026-09-09')],
    [r('edited-before', '2026-09-06', true), r('edited-after', '2026-09-05', true)],
    new Set(['edited-before', 'edited-after']),
  )
  assert.deepEqual(plan, { download: [], removeLocal: ['edited-before'], upload: [] })
})

test('planPull: 줄에 남은 일(여기서 지웠는데 아직 못 올린 것 등)은 드라이브 쪽으로 되돌리지 않는다', () => {
  // 여기서 지운 기록: 기기에는 없고 드라이브에는 아직 살아 있다 — 받으면 지운 기록이 되살아난다
  // 'edited'처럼 드라이브 판이 더 새것인 옛 고침은 이 받기에서는 건너뛰지만, 올리기도 건너뛰고 항목을 끝낸다 (아래 shouldPushRecord) —
  // 받기가 건너뛴 채로 올리기가 덮으면 드라이브의 더 새 판이 사라진다
  const plan = planPull([s('edited', '2026-09-01')], [r('deleted-here', '2026-09-01'), r('edited', '2026-09-09')], new Set(['deleted-here', 'edited']))
  assert.deepEqual(plan, { download: [], removeLocal: [], upload: [] })
})

test('줄에 남은 옛 고침은 드라이브의 더 새 판을 덮지 않는다 — 올리지 않고 항목을 끝내면 다음 받기가 새 판을 받아 온다', () => {
  // 폰: 산에서 오프라인일 때 10:00에 고쳐 줄에 남았다. PC: 12:00에 고쳐 드라이브에 올렸다
  const phone = s('x', '2026-09-27T10:00:00.000Z')
  const pc = r('x', '2026-09-27T12:00:00.000Z')
  assert.deepEqual(planPull([phone], [pc], new Set(['x'])).download, [])
  assert.equal(shouldPushRecord(phone, pc), false)
  // 항목을 뺀 뒤의 받기
  assert.deepEqual(planPull([phone], [pc], new Set()).download.map((x) => x.id), ['x'])
})

test('shouldPushRecord: 드라이브에 없거나 기기 판이 같거나 더 새것이면 올린다', () => {
  const mine = s('x', '2026-09-27T10:00:00.000Z')
  assert.equal(shouldPushRecord(mine, undefined), true)
  assert.equal(shouldPushRecord(mine, r('x', '2026-09-27T10:00:00.000Z')), true)
  assert.equal(shouldPushRecord(mine, r('x', '2026-09-27T09:00:00.000Z')), true)
})

test('shouldPushRecord: 지움 표시는 planPull과 같은 규칙 — 지움 뒤에 고쳤으면 올려 되살리고, 지움이 같거나 늦으면 올리지 않는다', () => {
  const mine = s('x', '2026-09-27T10:00:00.000Z')
  assert.equal(shouldPushRecord(mine, r('x', '2026-09-27T09:00:00.000Z', true)), true)
  assert.equal(shouldPushRecord(mine, r('x', '2026-09-27T10:00:00.000Z', true)), false)
  assert.equal(shouldPushRecord(mine, r('x', '2026-09-27T12:00:00.000Z', true)), false)
  // 올리지 않고 항목을 끝내면 다음 받기가 기기에서 지운다 (deleted='0'으로 드라이브의 지움을 덮지 않는다)
  assert.deepEqual(planPull([mine], [r('x', '2026-09-27T12:00:00.000Z', true)], new Set()).removeLocal, ['x'])
})

test('줄에 남은 옛 지움은 드라이브의 더 늦은 고침을 덮지 않는다 — 올리지 않고 항목을 끝내면 다음 받기가 고친 판을 받아 온다', () => {
  // 폰: 오프라인일 때 10:00에 지워 줄에 지움 항목이 남았다. PC: 12:00에 고쳐 드라이브에 올렸다
  const deletedAt = '2026-09-27T10:00:00.000Z'
  const pc = r('x', '2026-09-27T12:00:00.000Z')
  assert.deepEqual(planPull([], [pc], new Set(['x'])).download, [])
  assert.equal(shouldPushTombstone(deletedAt, pc), false)
  // 항목을 뺀 뒤의 받기 — planPull의 '지움 뒤에 고쳤으면 고친 쪽이 이긴다'와 같은 결과
  assert.deepEqual(planPull([], [pc], new Set()).download.map((x) => x.id), ['x'])
})

test('shouldPushTombstone: 드라이브에 없거나, 이미 지움 표시거나, 드라이브의 판이 지운 시각과 같거나 앞서면 올린다', () => {
  const deletedAt = '2026-09-27T10:00:00.000Z'
  assert.equal(shouldPushTombstone(deletedAt, undefined), true)
  assert.equal(shouldPushTombstone(deletedAt, r('x', '2026-09-27T09:00:00.000Z')), true)
  // 같은 시각이면 지움이 이긴다 (planPull: 지움이 기기의 고침과 같으면 기기에서 지운다)
  assert.equal(shouldPushTombstone(deletedAt, r('x', '2026-09-27T10:00:00.000Z')), true)
  assert.equal(shouldPushTombstone(deletedAt, r('x', '2026-09-27T12:00:00.000Z', true)), true)
})

test('remoteRecordOf: 우리 모양의 파일만 읽는다', () => {
  assert.deepEqual(remoteRecordOf({ id: 'f1', name: 'abc.json', appProperties: { updatedAt: 'T', deleted: '1' } }), { id: 'abc', fileId: 'f1', updatedAt: 'T', deleted: true })
  assert.equal(remoteRecordOf({ id: 'f2', name: 'notes.txt', appProperties: { updatedAt: 'T' } }), null)
  assert.equal(remoteRecordOf({ id: 'f3', name: 'abc.json' }), null) // 꼬리표 없음 — 사람이 넣은 파일
})

test('recordTags: 지운 기록은 deleted를 "1", 살아 있는 기록은 "0"으로 적는다 (안 보내면 앞의 "1"이 남는다)', () => {
  assert.deepEqual(recordTags('T', true), { updatedAt: 'T', deleted: '1' })
  assert.deepEqual(recordTags('T', false), { updatedAt: 'T', deleted: '0' })
})

test('remoteRecordOf: deleted "0"과 그 꼬리표가 없는 옛 파일은 살아 있는 기록으로 읽는다', () => {
  assert.equal(remoteRecordOf({ id: 'f1', name: 'abc.json', appProperties: { updatedAt: 'T', deleted: '0' } })?.deleted, false)
  assert.deepEqual(remoteRecordOf({ id: 'f2', name: 'abc.json', appProperties: { updatedAt: 'T' } }), { id: 'abc', fileId: 'f2', updatedAt: 'T', deleted: false })
})

test('다른 기기에서 지운 기록을 여기서 고쳐 올리면, 다음 동기화에서 지우지 않는다', () => {
  // 드라이브의 PATCH처럼 보낸 꼬리표만 바꾸고 안 보낸 꼬리표는 남긴다
  const patch = (tags: Record<string, string>, sent: Record<string, string>) => ({ ...tags, ...sent })
  const deletedThere = recordTags('2026-09-05', true)
  const editedHere = patch(deletedThere, recordTags('2026-09-09', false))
  const remote = remoteRecordOf({ id: 'f1', name: 'edited.json', appProperties: editedHere })
  assert.ok(remote)
  assert.deepEqual(planPull([s('edited', '2026-09-09')], [remote], new Set()), { download: [], removeLocal: [], upload: [] })
})

test('여기서 고친 것을 못 올린 사이 다른 기기에서 지우면, 올리지 않고 여기서도 지운다 (지운 기록이 되살아나지 않게)', () => {
  // 이 기기: 9/5에 고쳤고 올릴 일이 줄에 남았다. 다른 기기: 9/6에 지웠다
  const deletedThere = remoteRecordOf({ id: 'f1', name: 'x.json', appProperties: recordTags('2026-09-06', true) })
  assert.ok(deletedThere)
  const here = planPull([s('x', '2026-09-05')], [deletedThere], new Set(['x']))
  // 기기에서 지우면 줄의 올리기는 올릴 기록이 없어 그냥 끝난다 (syncTransfer pushEntry) — 드라이브의 지움은 그대로
  assert.deepEqual(here, { download: [], removeLocal: ['x'], upload: [] })
  assert.deepEqual(planPull([], [deletedThere], new Set()), { download: [], removeLocal: [], upload: [] }) // 지운 기기는 받지 않는다
})

test('accountDecision: 적어 둔 계정이 없으면 지금 계정을 적고 이어 간다 (처음 연결 · 이 확인 전부터 연결해 둔 기기)', () => {
  assert.equal(accountDecision(undefined, 'perm-A'), 'adopt')
  assert.equal(accountDecision('', 'perm-A'), 'adopt')
  // 저장소에 엉뚱한 값이 들어 있어도 없는 것으로 본다 (글자만 계정 표지다)
  assert.equal(accountDecision(42, 'perm-A'), 'adopt')
})

test('accountDecision: 같은 계정이면 그대로, 다른 계정이면 주고받기 전에 묻는다', () => {
  assert.equal(accountDecision('perm-A', 'perm-A'), 'same')
  assert.equal(accountDecision('perm-A', 'perm-B'), 'ask')
  // 대소문자만 달라도 다른 계정이다 — 표지는 구글이 준 그대로 견준다
  assert.equal(accountDecision('perm-a', 'perm-A'), 'ask')
})

test('askedAccountOf: 묻는 중 값은 새 계정 표지와 묻는 단계가 이동 기록 올리기를 껐는지', () => {
  assert.deepEqual(askedAccountOf({ id: 'perm-B', tracksWasOn: true }), { id: 'perm-B', tracksWasOn: true })
  assert.deepEqual(askedAccountOf({ id: 'perm-B', tracksWasOn: false }), { id: 'perm-B', tracksWasOn: false })
  // 처음 나온 판은 표지 글자만 적었다 — 묻는 중으로 읽고, 스위치는 켜져 있지 않았던 것으로 본다
  assert.deepEqual(askedAccountOf('perm-B'), { id: 'perm-B', tracksWasOn: false })
  // 참·거짓이 아닌 값은 켜져 있지 않았던 것으로 (결과 줄에 덧말만 빠진다)
  assert.deepEqual(askedAccountOf({ id: 'perm-B', tracksWasOn: 'yes' }), { id: 'perm-B', tracksWasOn: false })
})

test('askedAccountOf: 표지가 없거나 비었으면 묻는 중이 아니다 (null)', () => {
  for (const v of [undefined, null, '', 42, {}, { id: '' }, { id: 7, tracksWasOn: true }]) assert.equal(askedAccountOf(v), null, JSON.stringify(v))
})

test('keepsTombstones: 한 번이라도 드라이브와 연결한 기기는 끊긴 동안에도 지움 항목을 넣는다', () => {
  assert.equal(keepsTombstones(true, undefined, undefined), true)
  // 연결을 끊은 뒤 — 지움 표시가 없으면 다시 연결할 때 드라이브의 기록이 내려와 되살아난다
  assert.equal(keepsTombstones(false, true, undefined), true)
  // '연결한 적 있음' 표시가 생기기 전에 연결했다 끊은 기기 — 마지막 동기화 시각이 남아 있다
  assert.equal(keepsTombstones(false, undefined, '2026-11-01T00:00:00.000Z'), true)
})

test('keepsTombstones: 드라이브를 쓴 적이 없는 기기는 넣지 않는다 (줄이 끝없이 쌓이지 않게) — 저장소의 엉뚱한 값도 아님으로 본다', () => {
  assert.equal(keepsTombstones(undefined, undefined, undefined), false)
  assert.equal(keepsTombstones(false, undefined, ''), false)
  assert.equal(keepsTombstones('true', 1, 42), false)
})
