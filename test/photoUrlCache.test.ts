import test from 'node:test'
import assert from 'node:assert/strict'
import { createUrlCache } from '../src/data/photoUrlCache.ts'

/** 해제한 주소를 모으는 보관함 */
function cacheOf(limit: number) {
  const revoked: string[] = []
  return { cache: createUrlCache(limit, (url) => revoked.push(url)), revoked }
}

test('돌려준 주소는 남아 있다가 다시 빌리면 같은 주소가 나온다 — DB를 다시 읽지 않는다', () => {
  const { cache, revoked } = cacheOf(5)
  assert.equal(cache.take('a'), null)
  assert.equal(cache.put('a', 'blob:a'), 'blob:a')
  cache.release('a')
  assert.equal(cache.has('a'), true)
  assert.equal(cache.take('a'), 'blob:a')
  assert.deepEqual(revoked, [])
})

test('쓰는 곳이 없는 주소가 limit을 넘으면 가장 오래전에 빌린 것부터 해제한다', () => {
  const { cache, revoked } = cacheOf(2)
  for (const k of ['a', 'b', 'c']) cache.put(k, `blob:${k}`)
  // 목록이 한꺼번에 내려가며 목록 순서대로 돌려줘도, 순서는 빌린 때로 센다
  cache.release('c'); cache.release('b'); cache.release('a')
  assert.deepEqual(revoked, ['blob:a'])
  assert.equal(cache.take('a'), null)
  assert.equal(cache.take('b'), 'blob:b')
})

test('다시 빌리면 가장 최근이 된다', () => {
  const { cache, revoked } = cacheOf(2)
  for (const k of ['a', 'b']) { cache.put(k, `blob:${k}`); cache.release(k) }
  cache.take('a'); cache.release('a')
  cache.put('c', 'blob:c'); cache.release('c')
  assert.deepEqual(revoked, ['blob:b'])
})

test('쓰는 곳이 있는 주소는 limit을 넘어도 해제하지 않는다 — 화면의 그림이 깨진다', () => {
  const { cache, revoked } = cacheOf(0)
  cache.put('shown', 'blob:shown')
  cache.put('gone', 'blob:gone')
  cache.release('gone')
  assert.deepEqual(revoked, ['blob:gone'])
  // 두 곳이 같은 주소를 쓰면 둘 다 돌려줘야 해제한다
  assert.equal(cache.take('shown'), 'blob:shown')
  cache.release('shown')
  assert.deepEqual(revoked, ['blob:gone'])
  cache.release('shown')
  assert.deepEqual(revoked, ['blob:gone', 'blob:shown'])
  assert.equal(cache.has('shown'), false)
})

test('둘이 동시에 읽어 같은 키를 넣으면 나중 주소는 곧바로 해제하고 먼저 것을 함께 쓴다', () => {
  const { cache, revoked } = cacheOf(0)
  assert.equal(cache.put('a', 'blob:first'), 'blob:first')
  assert.equal(cache.put('a', 'blob:second'), 'blob:first')
  assert.deepEqual(revoked, ['blob:second'])
  cache.release('a')
  assert.deepEqual(revoked, ['blob:second'])
  cache.release('a')
  assert.deepEqual(revoked, ['blob:second', 'blob:first'])
})

test('빌리지 않은 키나 더 돌려주는 것은 아무 일도 하지 않는다 (쓰는 수가 음수가 되지 않는다)', () => {
  const { cache, revoked } = cacheOf(1)
  cache.release('none')
  cache.put('a', 'blob:a')
  cache.release('a')
  cache.release('a')
  // 'a'는 쉬는 하나뿐 — 음수로 셌으면 다음 것이 빌려 있는 동안에도 해제됐다
  cache.put('b', 'blob:b')
  assert.deepEqual(revoked, [])
  cache.release('b')
  assert.deepEqual(revoked, ['blob:a'])
})
