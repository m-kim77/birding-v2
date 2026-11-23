import test from 'node:test'
import assert from 'node:assert/strict'
import { installFakeIdb } from './fakeIdb.ts'
import { openDb } from '../src/data/db.ts'
import { deleteSightingWithPhotos } from '../src/data/photos.ts'
import { isDriveLinked, setDriveLinked } from '../src/data/syncQueue.ts'

const fake = installFakeIdb()
// 저장소를 만들게 한 번 연다 (seed는 있는 저장소에만 넣는다)
await openDb()
const NOW = new Date('2026-11-23T05:00:00.000Z')

test("setDriveLinked: 끊을 때도 '연결한 적 있음'을 남긴다 — 끊은 뒤에 지운 기록도 지움 항목이 줄에 남는다", async () => {
  fake.clear()
  await setDriveLinked(false)
  assert.equal(fake.peek('meta', 'driveEverLinked'), true)
  fake.seed('sightings', 'x', { id: 'x', capturedAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z' })
  await deleteSightingWithPhotos('x', NOW)
  assert.deepEqual(fake.keys('syncQueue'), ['x'])
})

test('미리 열려 있던 탭(연결 안 됨으로 기억)에서 지워도, 다른 탭이 연결했으면 지움 항목을 넣는다 — 지울 때마다 저장소를 읽는다', async () => {
  fake.clear()
  // 이 탭은 연결 전의 값을 기억한다 (isDriveLinked는 탭마다 한 번 읽는다)
  await setDriveLinked(false)
  fake.clear()
  assert.equal(await isDriveLinked(), false)
  // 다른 탭이 연결했다
  fake.seed('meta', 'driveLinked', true)
  fake.seed('sightings', 'y', { id: 'y', capturedAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z' })
  await deleteSightingWithPhotos('y', NOW)
  assert.deepEqual(fake.keys('syncQueue'), ['y'])
})
