import test from 'node:test'
import assert from 'node:assert/strict'
import { installFakeIdb } from './fakeIdb.ts'
import { dbGet, dbGetAll, dbPut } from '../src/data/db.ts'

// 모듈의 기억(연 연결)을 시험끼리 함께 쓴다 — 순서대로 돌고, 판이 바뀌는 시험은 맨 끝에 둔다
const fake = installFakeIdb()

test('브라우저가 연결을 끊으면(onclose — 아이폰의 연결 끊김) 다음 읽기·쓰기가 새로 연다', async () => {
  await dbPut('meta', '처음', 'k')
  assert.equal(fake.opens, 1)
  fake.connections[0].lose()
  await dbPut('meta', '끊긴 뒤', 'k')
  assert.equal(await dbGet('meta', 'k'), '끊긴 뒤')
  assert.equal(fake.opens, 2)
})

test('닫힘 알림 없이 닫힌 연결이면(InvalidStateError) 한 번만 새로 열어 같은 일을 한다 — 두 번 쓰지 않는다', async () => {
  fake.clear()
  fake.connections.at(-1)!.closeSilently()
  await dbPut('sightings', { id: 'a', updatedAt: 'T' })
  assert.deepEqual(fake.keys('sightings'), ['a'])
  assert.deepEqual(await dbGetAll('sightings'), [{ id: 'a', updatedAt: 'T' }])
  assert.equal(fake.opens, 3)
})

test('다른 탭이 판을 올리려 하면(versionchange) 연결을 곧바로 놓고, 이 탭은 새로 고치라는 안내로 거절한다', async () => {
  const db = fake.connections.at(-1)!
  db.onversionchange?.()
  assert.equal(db.closed, true)
  // 옛 판의 코드로 다시 열지 않는다 — 열면 새 판의 저장소를 옛 규칙으로 쓴다
  await assert.rejects(dbGet('meta', 'k'), /새로 고쳐 주세요/)
  await assert.rejects(dbPut('meta', 'x', 'k'), /새로 고쳐 주세요/)
  assert.equal(fake.opens, 3)
})
