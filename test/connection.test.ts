import test from 'node:test'
import assert from 'node:assert/strict'

/** 브라우저 localStorage 흉내 — 이 파일에서만 쓴다 */
const store = new Map<string, string>()
;(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v) },
  removeItem: (k: string) => { store.delete(k) },
}
const { loadOwnKey, loadStoredKey, saveOwnKey, setOwnKeyEnabled } = await import('../src/features/identify/connection.ts')
const KEY = { baseUrl: 'https://example.test/v1', apiKey: 'sk-test', model: 'vision-1' }

test('기본 제공 AI로 돌아가도 저장한 키는 남는다 (라디오를 잘못 눌러도 키를 잃지 않는다)', () => {
  saveOwnKey(KEY)
  assert.deepEqual(loadOwnKey(), KEY)
  setOwnKeyEnabled(false)
  assert.equal(loadOwnKey(), null)
  assert.deepEqual(loadStoredKey(), { key: KEY, enabled: false })
  setOwnKeyEnabled(true)
  assert.deepEqual(loadOwnKey(), KEY)
})

test('지우면 정말 없어진다', () => {
  saveOwnKey(KEY)
  saveOwnKey(null)
  assert.equal(loadOwnKey(), null)
  assert.deepEqual(loadStoredKey(), { key: null, enabled: false })
  setOwnKeyEnabled(true)
  assert.equal(loadOwnKey(), null)
})

test('enabled 키가 없던 옛 저장값은 켜진 것으로 읽는다', () => {
  store.set('bird-journal:own-llm', JSON.stringify(KEY))
  assert.deepEqual(loadOwnKey(), KEY)
})
