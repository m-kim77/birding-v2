import test from 'node:test'
import assert from 'node:assert/strict'
import { MAX_COUNT, countOf, countText, isBadCount, parseCount } from '../src/lib/count.ts'

test('countOf: 1~999,999의 정수만 개체 수다 — 글자·0·음수·소수·너무 큰 수는 세지 않음', () => {
  assert.equal(countOf(1), 1)
  assert.equal(countOf(MAX_COUNT), 999_999)
  for (const bad of [0, -1, 2.5, MAX_COUNT + 1, Number.NaN, Number.POSITIVE_INFINITY, '3', null, undefined, true]) {
    assert.equal(countOf(bad), undefined, String(bad))
  }
})

test('parseCount: 입력칸의 글자 — 앞뒤 공백은 떼고, 숫자만 된 글자만 읽는다', () => {
  assert.equal(parseCount('3'), 3)
  assert.equal(parseCount(' 12 '), 12)
  assert.equal(parseCount('999999'), 999_999)
  for (const bad of ['', '  ', '0', '-3', '2.5', '셋', '3마리', '1e3', '0x10', '1000000', '１２']) {
    assert.equal(parseCount(bad), undefined, bad)
  }
})

test('isBadCount: 비운 칸은 괜찮고(세지 않음), 적었는데 읽히지 않으면 알린다', () => {
  assert.equal(isBadCount(''), false)
  assert.equal(isBadCount('  '), false)
  assert.equal(isBadCount('7'), false)
  assert.equal(isBadCount('2.5'), true)
  assert.equal(isBadCount('0'), true)
})

test('countText: 세었으면 "N마리"(천 단위 쉼표), 안 셌으면 빈 글자', () => {
  assert.equal(countText(3), '3마리')
  assert.equal(countText(1200), '1,200마리')
  assert.equal(countText(undefined), '')
  assert.equal(countText(0), '', '개체 수로 읽히지 않는 값도 빈 글자')
})
