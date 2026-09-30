import test from 'node:test'
import assert from 'node:assert/strict'

/** 브라우저 localStorage 흉내 — 이 파일에서만 쓴다 */
const store = new Map<string, string>()
;(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v) },
  removeItem: (k: string) => { store.delete(k) },
}
const { checkConnection, loadOwnKey, loadStoredKey, saveOwnKey, setOwnKeyEnabled } = await import('../src/features/identify/connection.ts')
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

/** 불린 요청을 적어 두고, 정해 둔 응답(또는 던질 것)을 돌려주는 가짜 fetch */
function fakeFetch(reply: Response | Error) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = []
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    if (reply instanceof Error) throw reply
    return reply
  }) as typeof fetch
  return { fn, calls }
}

/** 모델 목록 응답 (OpenAI 호환: { data: [{ id }] }) */
const modelList = (...ids: string[]) => new Response(JSON.stringify({ data: ids.map((id) => ({ id })) }), { status: 200 })

test('checkConnection: 그 서비스의 /models에 키를 실어 묻는다 (주소 끝의 /는 한 번만)', async () => {
  const { fn, calls } = fakeFetch(modelList('vision-1'))
  await checkConnection({ ...KEY, baseUrl: 'https://example.test/v1/' }, fn)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://example.test/v1/models')
  assert.deepEqual(calls[0].init, { headers: { authorization: 'Bearer sk-test' } })
})

test('checkConnection: 목록에 고른 모델이 있으면 연결됐다고 알린다', async () => {
  const { fn } = fakeFetch(modelList('other', 'vision-1'))
  assert.deepEqual(await checkConnection(KEY, fn), { tone: 'ok', text: '연결됐습니다. 이제 이 키로 판정합니다.' })
})

test('checkConnection: 주소에 닿지 못하면 던진다 (저장하지 않는다)', async () => {
  const { fn } = fakeFetch(new TypeError('Failed to fetch'))
  await assert.rejects(checkConnection(KEY, fn), { message: /^주소에 닿지 못했습니다/ })
})

test('checkConnection: 키가 틀리면(401·403) 던진다 (저장하지 않는다)', async () => {
  for (const status of [401, 403]) {
    const { fn } = fakeFetch(new Response('', { status }))
    await assert.rejects(checkConnection(KEY, fn), { message: '키가 맞지 않습니다.' })
  }
})

test('checkConnection: 그 밖의 오류 응답은 던지지 않고 경고로 돌려준다 — 상태 번호가 들어 있다', async () => {
  for (const status of [404, 500, 503]) {
    const { fn } = fakeFetch(new Response('', { status }))
    const result = await checkConnection(KEY, fn)
    assert.equal(result.tone, 'warn')
    assert.match(result.text, new RegExp(`^모델 목록을 확인하지 못했습니다 \\(${status}\\)\\. 키는 저장했습니다`))
  }
})

test('checkConnection: 목록이 JSON이 아니면(엉뚱한 주소) 경고로 돌려준다', async () => {
  const { fn } = fakeFetch(new Response('<html>hello</html>', { status: 200 }))
  const result = await checkConnection(KEY, fn)
  assert.equal(result.tone, 'warn')
  assert.match(result.text, /^그 주소는 모델 목록 대신 다른 것을 돌려줍니다/)
})

test('checkConnection: 목록에 고른 모델이 없으면 모델 이름을 넣어 경고한다', async () => {
  const { fn } = fakeFetch(modelList('other-1', 'other-2'))
  const result = await checkConnection(KEY, fn)
  assert.equal(result.tone, 'warn')
  assert.match(result.text, /^연결은 됐지만 "vision-1" 모델이 목록에 없습니다/)
})

test('checkConnection: 목록을 비워 주거나 data가 없는 서비스는 모델을 대조하지 않고 연결된 것으로 본다', async () => {
  for (const reply of [modelList(), new Response('{}', { status: 200 })]) {
    const { fn } = fakeFetch(reply)
    assert.equal((await checkConnection(KEY, fn)).tone, 'ok')
  }
})

test('checkConnection: 확인만 한다 — 저장된 키를 건드리지 않는다', async () => {
  saveOwnKey(null)
  const { fn } = fakeFetch(modelList('vision-1'))
  await checkConnection(KEY, fn)
  assert.equal(loadOwnKey(), null, '저장은 부르는 쪽(설정 카드)이 던지지 않고 돌아왔을 때 한다')
})
