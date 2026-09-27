import test from 'node:test'
import assert from 'node:assert/strict'
import { koreanName } from '../src/features/identify/tools/koreanName.ts'

const realFetch = globalThis.fetch
test.afterEach(() => { globalThis.fetch = realFetch })

/**
 * 가짜 위키백과. 영어 쪽은 학명마다 { 닿은 문서 제목, 한국어 연결 }을, 한국어 쪽은 넘겨주기(제목 → 실제 제목)를 준다.
 * 부른 주소를 `calls`에 적는다 — 요청을 몇 번 했는지 센다.
 */
function fakeWiki(en: Record<string, { title: string; ko?: string }>, koRedirects: Record<string, string> = {}) {
  const calls: string[] = []
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    calls.push(url.host)
    const asked = url.searchParams.get('titles') ?? ''
    if (url.host === 'en.wikipedia.org') {
      const hit = en[asked]
      const page = hit ? { title: hit.title, ...(hit.ko ? { langlinks: [{ lang: 'ko', '*': hit.ko }] } : {}) } : { title: asked, missing: '' }
      return Response.json({ query: { pages: { 1: page } } })
    }
    const to = koRedirects[asked]
    return Response.json({ query: { pages: { 1: to ? { title: to } : { title: asked, missing: '' } } } })
  }) as typeof fetch
  return calls
}

test('종 표에 있는 학명은 요청 없이 바로 답한다 (대소문자·공백 무시)', async () => {
  const calls = fakeWiki({})
  assert.deepEqual(await koreanName({ scientific_name: ' parus MINOR ' }), { scientific_name: 'parus MINOR', korean_name: '박새', source: '앱의 종 표' })
  assert.equal(calls.length, 0)
})

test('한글 제목이 연결돼 있으면 그 이름을 준다 (한 번만 묻는다)', async () => {
  const calls = fakeWiki({ 'Nycticorax nycticorax': { title: 'Black-crowned night heron', ko: '해오라기' } })
  const r = await koreanName({ scientific_name: 'Nycticorax nycticorax' }) as Record<string, unknown>
  assert.equal(r.korean_name, '해오라기')
  assert.equal(r.wikipedia_title, 'Black-crowned night heron')
  assert.deepEqual(calls, ['en.wikipedia.org'])
})

test('연결된 제목이 영문 넘겨주기면 한국어 위키백과에서 풀고 꼬리표를 뗀다 (작업 20의 실제 사례)', async () => {
  const calls = fakeWiki({ 'Parus cinereus': { title: 'Cinereous tit', ko: 'Cinereous tit' } }, { 'Cinereous tit': '박새 (새)' })
  const r = await koreanName({ scientific_name: 'Parus cinereus' }) as Record<string, unknown>
  assert.equal(r.korean_name, '박새')
  assert.deepEqual(calls, ['en.wikipedia.org', 'ko.wikipedia.org'])
})

test('풀어도 한글 이름이 아니면 영어 제목을 주지 않고 없다고 답한다', async () => {
  fakeWiki({ 'Aaa bbb': { title: 'Some bird', ko: 'Some bird' } })
  const r = await koreanName({ scientific_name: 'Aaa bbb' }) as Record<string, unknown>
  assert.equal(r.korean_name, null)
  assert.match(String(r.note), /지어내지/)
})

test('과·목·속 이름은 국명이 아니다', async () => {
  fakeWiki({ Picidae: { title: 'Woodpecker', ko: '딱따구리과' } })
  assert.equal((await koreanName({ scientific_name: 'Picidae' }) as Record<string, unknown>).korean_name, null)
})

test('한국어 연결이 없거나 문서가 없으면 없다고 답한다', async () => {
  fakeWiki({ 'Butorides atricapilla': { title: 'Little heron' } })
  assert.equal((await koreanName({ scientific_name: 'Butorides atricapilla' }) as Record<string, unknown>).korean_name, null)
  assert.equal((await koreanName({ scientific_name: 'Nonexistent name' }) as Record<string, unknown>).korean_name, null)
})

test('학명이 비었거나 위키백과에 닿지 못하면 오류를 결과로 돌려준다 (던지지 않는다)', async () => {
  assert.deepEqual(await koreanName({}), { error: '학명이 비어 있습니다.' })
  globalThis.fetch = (async () => { throw new TypeError('Failed to fetch') }) as typeof fetch
  assert.deepEqual(await koreanName({ scientific_name: 'Aaa bbb' }), { error: '위키백과에 닿지 못했습니다.' })
  globalThis.fetch = (async () => new Response('too many', { status: 429 })) as typeof fetch
  assert.deepEqual(await koreanName({ scientific_name: 'Aaa bbb' }), { error: '위키백과에 닿지 못했습니다.' })
})

test('넘겨주기를 풀다 실패하면 영어 제목이 남아 없다고 답한다', async () => {
  let n = 0
  globalThis.fetch = (async () => {
    n += 1
    if (n === 1) return Response.json({ query: { pages: { 1: { title: 'Cinereous tit', langlinks: [{ lang: 'ko', '*': 'Cinereous tit' }] } } } })
    throw new TypeError('Failed to fetch')
  }) as typeof fetch
  assert.equal((await koreanName({ scientific_name: 'Parus cinereus' }) as Record<string, unknown>).korean_name, null)
})
