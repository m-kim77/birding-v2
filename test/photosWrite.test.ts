import test from 'node:test'
import assert from 'node:assert/strict'
import { installFakeIdb } from './fakeIdb.ts'
import { openDb } from '../src/data/db.ts'
import { deleteSightingWithPhotos, patchSighting, writeSightingIfNewer } from '../src/data/photos.ts'
import type { QueueEntry } from '../src/data/syncPlan.ts'
import type { Sighting } from '../src/types.ts'

const fake = installFakeIdb()
// 저장소를 만들게 한 번 연다 (seed는 있는 저장소에만 넣는다)
await openDb()
const NOW = new Date('2026-11-23T05:00:00.000Z')

/** 검사에 필요한 칸만 채운 기기 기록 (나머지는 normalizeStored가 채운다) */
const stored = (id: string, over: Record<string, unknown> = {}) => ({ id, capturedAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-20T00:00:00.000Z', ...over })

test('patchSighting: 고친 칸은 화면의 판이 아니라 DB의 판 위에 얹는다 — 그사이 동기화가 받아 쓴 다른 칸이 남는다', async () => {
  fake.clear()
  // 화면이 읽은 뒤에 동기화가 다른 기기의 고침(메모)을 DB에 썼다
  fake.seed('sightings', 'x', stored('x', { note: 'PC에서 고친 메모', updatedAt: '2026-11-22T00:00:00.000Z' }))
  const next = await patchSighting('x', { sensitive: true }, NOW)
  const saved = fake.peek('sightings', 'x') as Sighting
  assert.equal(saved.note, 'PC에서 고친 메모')
  assert.equal(saved.sensitive, true)
  assert.equal(saved.updatedAt, NOW.toISOString())
  // 화면에 돌려주는 판도 DB에 쓴 것과 같다
  assert.deepEqual(next, saved)
})

test('patchSighting: 그새 지워진 기록은 되살리지 않는다 (null, 아무것도 쓰지 않음)', async () => {
  fake.clear()
  assert.equal(await patchSighting('gone', { note: '고침' }, NOW), null)
  assert.deepEqual(fake.keys('sightings'), [])
})

test('writeSightingIfNewer: 쓰는 트랜잭션 안에서 다시 보고, 기기 판이 같거나 더 새것이면 기록도 사진도 쓰지 않는다', async () => {
  fake.clear()
  // 백업 불러오기가 계획을 정한 뒤, 동기화가 드라이브의 더 새 판(12:00)을 받아 썼다
  fake.seed('sightings', 'x', stored('x', { note: '12시 판', updatedAt: '2026-11-22T12:00:00.000Z' }))
  fake.seed('photos', 'x:full', '기기 사진')
  const older = { ...stored('x', { note: '9시 판', updatedAt: '2026-11-22T09:00:00.000Z' }) } as Sighting
  assert.equal(await writeSightingIfNewer(older, [{ kind: 'full', blob: new Blob(['백업 사진']) }]), false)
  assert.equal((fake.peek('sightings', 'x') as Sighting).note, '12시 판')
  assert.equal(fake.peek('photos', 'x:full'), '기기 사진')
  // 같은 시각도 기기 쪽을 그대로 둔다 (planMerge와 같다)
  const same = { ...stored('x', { note: '같은 시각', updatedAt: '2026-11-22T12:00:00.000Z' }) } as Sighting
  assert.equal(await writeSightingIfNewer(same, []), false)
  assert.equal((fake.peek('sightings', 'x') as Sighting).note, '12시 판')
})

test('writeSightingIfNewer: 기기에 없거나 기기 판이 더 오래됐으면 기록과 사진을 함께 쓴다', async () => {
  fake.clear()
  fake.seed('sightings', 'old', stored('old', { updatedAt: '2026-11-01T00:00:00.000Z' }))
  const newer = stored('old', { note: '새 판', updatedAt: '2026-11-22T00:00:00.000Z' }) as Sighting
  assert.equal(await writeSightingIfNewer(newer, [{ kind: 'thumb', blob: new Blob(['t']) }]), true)
  assert.equal((fake.peek('sightings', 'old') as Sighting).note, '새 판')
  assert.ok(fake.peek('photos', 'old:thumb') instanceof Blob)
  assert.equal(await writeSightingIfNewer(stored('fresh') as Sighting, []), true)
  assert.deepEqual(fake.keys('sightings').sort(), ['fresh', 'old'])
})

/** 지울 기록 하나와 그 사진 세 판을 넣어 둔다 */
function seedRecordWithPhotos(id: string) {
  fake.seed('sightings', id, stored(id))
  for (const kind of ['full', 'thumb', 'crop']) fake.seed('photos', `${id}:${kind}`, `${kind} 사진`)
}

test('deleteSightingWithPhotos: 연결을 끊은 동안 지워도 한 번이라도 연결한 기기면 지움 항목을 같은 트랜잭션에 넣는다', async () => {
  for (const meta of [{ driveLinked: false, driveEverLinked: true }, { driveLinked: false, lastSyncAt: '2026-11-01T00:00:00.000Z' }, { driveLinked: true }]) {
    fake.clear()
    for (const [k, v] of Object.entries(meta)) fake.seed('meta', k, v)
    seedRecordWithPhotos('x')
    await deleteSightingWithPhotos('x', NOW)
    assert.deepEqual(fake.keys('sightings'), [], JSON.stringify(meta))
    assert.deepEqual(fake.keys('photos'), [], JSON.stringify(meta))
    const entry = fake.peek('syncQueue', 'x') as QueueEntry | undefined
    assert.equal(entry?.op, 'delete', JSON.stringify(meta))
    assert.equal(entry?.at, NOW.toISOString())
  }
})

test('deleteSightingWithPhotos: 드라이브를 쓴 적이 없는 기기는 기록과 사진만 지우고 줄에 넣지 않는다', async () => {
  fake.clear()
  seedRecordWithPhotos('x')
  await deleteSightingWithPhotos('x', NOW)
  assert.deepEqual([fake.keys('sightings'), fake.keys('photos'), fake.keys('syncQueue')], [[], [], []])
})
