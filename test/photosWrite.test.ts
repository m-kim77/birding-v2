import test from 'node:test'
import assert from 'node:assert/strict'
import { installFakeIdb } from './fakeIdb.ts'
import { openDb } from '../src/data/db.ts'
import { patchSighting } from '../src/data/photos.ts'
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
