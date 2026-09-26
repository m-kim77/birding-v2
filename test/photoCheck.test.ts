import test from 'node:test'
import assert from 'node:assert/strict'
import { checkPhotos, findOrphanKeys } from '../src/data/photoCheck.ts'
import { PHOTO_KINDS, photoKey, photoOwner } from '../src/data/photoKey.ts'

/** 기록 한 건의 사진 키들 */
const keysOf = (id: string, kinds: string[]) => kinds.map((k) => `${id}:${k}`)

test('photoKey·photoOwner: 왕복하고, id에 ":"가 있어도 마지막 ":" 앞이 id다', () => {
  for (const kind of PHOTO_KINDS) assert.equal(photoOwner(photoKey('a1b2', kind)), 'a1b2')
  assert.equal(photoOwner('v1:42:full'), 'v1:42')
  assert.equal(photoOwner('콜론없음'), '콜론없음', '앱이 만들지 않는 모양은 키 전체를 id로 본다')
})

test('checkPhotos: 큰 판·작은 판이 다 있으면 멀쩡하다 — 잘라낸 판은 없어도 된다', () => {
  const r = checkPhotos([{ id: 'a', fromSound: false }, { id: 'b', fromSound: false }], [...keysOf('a', ['full', 'thumb', 'crop']), ...keysOf('b', ['full', 'thumb'])])
  assert.deepEqual(r.missing, [])
  assert.deepEqual(r.orphanKeys, [])
  assert.equal(r.orphanRecords, 0)
})

test('checkPhotos: 사진이 빠진 기록은 무엇이 없는지와 함께, 읽은 순서대로', () => {
  const r = checkPhotos(
    [{ id: 'none', fromSound: false }, { id: 'noThumb', fromSound: false }, { id: 'noFull', fromSound: false }, { id: 'ok', fromSound: false }],
    [...keysOf('noThumb', ['full', 'crop']), ...keysOf('noFull', ['thumb']), ...keysOf('ok', ['full', 'thumb'])],
  )
  assert.deepEqual(r.missing, [
    { id: 'none', kinds: ['full', 'thumb'] },
    { id: 'noThumb', kinds: ['thumb'] },
    { id: 'noFull', kinds: ['full'] },
  ])
})

test('checkPhotos: 소리 기록은 사진이 없어도 빠진 것으로 치지 않는다', () => {
  assert.deepEqual(checkPhotos([{ id: 's', fromSound: true }], []).missing, [])
})

test('checkPhotos: 기록이 없는 사진은 키 전부, 수는 (없어진) 기록 수로 센다', () => {
  const r = checkPhotos([{ id: 'a', fromSound: false }], [...keysOf('a', ['full', 'thumb']), ...keysOf('gone1', ['full', 'thumb', 'crop']), ...keysOf('gone2', ['full'])])
  assert.deepEqual(r.orphanKeys, [...keysOf('gone1', ['full', 'thumb', 'crop']), 'gone2:full'])
  assert.equal(r.orphanRecords, 2, '판 넷이 아니라 기록 둘이다')
})

test('findOrphanKeys: 기록이 없으면 모르는 판도 고르고, 기록이 있으면 모르는 판도 남긴다 (새 판의 앱이 더한 판일 수 있다)', () => {
  const keys = ['a:full', 'a:original', 'gone:original', '콜론없음']
  assert.deepEqual(findOrphanKeys(['a'], keys), ['gone:original', '콜론없음'])
  assert.deepEqual(findOrphanKeys([], keys), keys, '기록이 하나도 없으면 전부')
  assert.deepEqual(findOrphanKeys(['a', 'gone', '콜론없음'], keys), [])
})
