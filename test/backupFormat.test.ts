import test from 'node:test'
import assert from 'node:assert/strict'
import { BACKUP_FORMAT, buildJournal, parseJournal, parsePhotoPath, photoPath, planMerge } from '../src/data/backupFormat.ts'
import type { Sighting } from '../src/types.ts'

/** 검사에 필요한 값만 채운 기록 */
function sighting(id: string, updatedAt: string): Sighting {
  return { id, updatedAt } as Sighting
}

test('planMerge: 없던 기록은 더하고, 같은 id는 더 최신인 쪽만 갱신한다', () => {
  const local = [sighting('a', '2026-09-01T00:00:00.000Z'), sighting('b', '2026-09-05T00:00:00.000Z')]
  const incoming = [sighting('a', '2026-09-02T00:00:00.000Z'), sighting('b', '2026-09-04T00:00:00.000Z'), sighting('c', '2026-09-03T00:00:00.000Z')]
  const plan = planMerge(local, incoming)
  assert.deepEqual(plan.add.map((s) => s.id), ['c'])
  assert.deepEqual(plan.update.map((s) => s.id), ['a'])
  assert.equal(plan.kept, 1)
})

test('planMerge: 기기에만 있는 기록은 건드리지 않는다 (불러오기는 더하기다)', () => {
  const plan = planMerge([sighting('only-here', '2026-09-01T00:00:00.000Z')], [])
  assert.deepEqual(plan, { add: [], update: [], kept: 0 })
})

test('planMerge: 시각이 같으면 기기 쪽을 그대로 둔다', () => {
  const at = '2026-09-01T00:00:00.000Z'
  assert.equal(planMerge([sighting('a', at)], [sighting('a', at)]).kept, 1)
})

test('parseJournal: 만든 것을 그대로 다시 읽는다', () => {
  const j = buildJournal([sighting('a', '2026-09-01T00:00:00.000Z')], new Date('2026-09-22T00:00:00Z'))
  assert.equal(parseJournal(JSON.stringify(j)).sightings[0].id, 'a')
})

test('parseJournal: 우리 백업이 아니면 던진다', () => {
  assert.throws(() => parseJournal('not json'), /읽을 수 없습니다/)
  assert.throws(() => parseJournal('{"hello":1}'), /백업 파일이 아닙니다/)
})

test('parseJournal: 더 새 버전의 백업은 거절한다 (절반만 이해한 채 합치지 않는다)', () => {
  assert.throws(() => parseJournal(JSON.stringify({ format: BACKUP_FORMAT, version: 99, sightings: [] })), /새로운 버전/)
})

test('parseJournal: 모르는 키는 무시한다 (가산 확장)', () => {
  const j = { format: BACKUP_FORMAT, version: 1, exportedAt: 'x', sightings: [], futureKey: { anything: true } }
  assert.deepEqual(parseJournal(JSON.stringify(j)).sightings, [])
})

test('photoPath ↔ parsePhotoPath 왕복', () => {
  assert.deepEqual(parsePhotoPath(photoPath('3f2a-uuid', 'crop')), { id: '3f2a-uuid', kind: 'crop' })
  assert.equal(parsePhotoPath('journal.json'), null)
  assert.equal(parsePhotoPath('photos/x.evil.exe'), null)
})
