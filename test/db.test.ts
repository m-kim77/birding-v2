import test from 'node:test'
import assert from 'node:assert/strict'
import { StorageFullError, storageError } from '../src/data/db.ts'

test('storageError: 용량 부족은 한국어 안내로 바꾼다', () => {
  const e = storageError(new DOMException('The quota has been exceeded.', 'QuotaExceededError'))
  assert.match(e.message, /저장 공간이 모자라/)
})

test('storageError: 용량 부족은 StorageFullError라 알아볼 수 있다 — 동기화의 받기가 보고 남은 받기를 그만둔다', () => {
  assert.ok(storageError(new DOMException('The quota has been exceeded.', 'QuotaExceededError')) instanceof StorageFullError)
  assert.ok(!(storageError(new Error('다른 오류')) instanceof StorageFullError))
  assert.ok(!(storageError(null) instanceof StorageFullError))
})

test('storageError: 다른 Error는 그대로, Error가 아니거나 비었으면 일반 안내', () => {
  const orig = new Error('다른 탭에서 열려 있습니다')
  assert.equal(storageError(orig), orig)
  assert.equal(storageError(null).message, '저장소에 쓰지 못했습니다.')
  assert.equal(storageError('문자열').message, '저장소에 쓰지 못했습니다.')
})
