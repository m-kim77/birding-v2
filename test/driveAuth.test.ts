import test from 'node:test'
import assert from 'node:assert/strict'
import { readCookie, seal, unseal } from '../api/_lib/cookieSeal.ts'

// 시험용 키 (32바이트). 실제 키는 환경변수에만 있다
const KEY = Buffer.alloc(32, 7).toString('base64')
const OTHER = Buffer.alloc(32, 9).toString('base64')

test('seal/unseal: 잠근 것을 그대로 푼다, 잠글 때마다 결과가 다르다', async () => {
  const a = await seal('1//refresh-token', KEY)
  const b = await seal('1//refresh-token', KEY)
  assert.notEqual(a, b)
  assert.equal(await unseal(a, KEY), '1//refresh-token')
  assert.match(a, /^[A-Za-z0-9_-]+$/) // 쿠키에 그대로 넣을 수 있는 글자만
})

test('unseal: 바뀐 값·다른 키·깨진 값은 null (던지지 않는다)', async () => {
  const sealed = await seal('secret', KEY)
  const flipped = (sealed[20] === 'A' ? 'B' : 'A')
  assert.equal(await unseal(sealed.slice(0, 20) + flipped + sealed.slice(21), KEY), null)
  assert.equal(await unseal(sealed, OTHER), null)
  assert.equal(await unseal('!!!', KEY), null)
  assert.equal(await unseal('', KEY), null)
})

test('seal: 키가 없거나 32바이트가 아니면 던진다 (약한 잠금으로 조용히 돌지 않는다)', async () => {
  await assert.rejects(seal('x', undefined))
  await assert.rejects(seal('x', Buffer.alloc(16).toString('base64')))
})

test('readCookie: 이름으로 값을 꺼낸다, 없으면 빈 글자', () => {
  assert.equal(readCookie('a=1; drive_rt=abc=; b=2', 'drive_rt'), 'abc=')
  assert.equal(readCookie(null, 'drive_rt'), '')
  assert.equal(readCookie('drive_rtx=1', 'drive_rt'), '')
})

// 통로 함수: 구글 토큰 창구는 가짜 fetch로 대신한다 (진짜 구글에 가지 않는다)
const realFetch = globalThis.fetch
// 세 번째 인자는 요청의 Authorization 머리 (드라이브 계정 묻기가 어느 출입증으로 왔는지 가린다)
let google: (url: string, body: URLSearchParams, auth: string) => Response = () => new Response('{}', { status: 500 })
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => google(String(input), init?.body as URLSearchParams, new Headers(init?.headers).get('authorization') ?? '')) as typeof fetch
test.after(() => { globalThis.fetch = realFetch })
process.env.GOOGLE_CLIENT_ID = 'client-1'
process.env.GOOGLE_CLIENT_SECRET = 'secret-1'
process.env.DRIVE_COOKIE_KEY = KEY
const { GET, POST, DELETE } = await import('../api/drive.ts')

const SITE = 'https://birds.example'
/** 통로에 보낼 요청 */
function req(method: string, opts: { cookie?: string; origin?: string; body?: unknown } = {}): Request {
  const headers: Record<string, string> = {}
  if (opts.cookie) headers.cookie = opts.cookie
  if (opts.origin) headers.origin = opts.origin
  return new Request(`${SITE}/api/drive`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) })
}

test('GET: 쿠키가 없으면 연결 안 됨 + 클라이언트 ID', async () => {
  const body = await (await GET(req('GET'))).json()
  assert.deepEqual(body, { configured: true, clientId: 'client-1', connected: false })
})

test('GET: 환경변수가 빠지면 configured:false', async () => {
  delete process.env.DRIVE_COOKIE_KEY
  try {
    assert.equal((await (await GET(req('GET'))).json()).configured, false)
  } finally { process.env.DRIVE_COOKIE_KEY = KEY }
})

test('GET: 쿠키의 갱신권으로 새 출입증을 받고, 쿠키 수명을 늘린다', async () => {
  let sent: URLSearchParams | null = null
  google = (_url, body) => { sent = body; return Response.json({ access_token: 'ya29.new', expires_in: 3599 }) }
  const res = await GET(req('GET', { cookie: `drive_rt=${await seal('1//rt', KEY)}` }))
  const body = await res.json()
  assert.equal(body.accessToken, 'ya29.new')
  assert.equal(sent!.get('refresh_token'), '1//rt')
  assert.match(res.headers.get('set-cookie') ?? '', /HttpOnly; SameSite=Strict; Secure/)
  assert.equal(res.headers.get('cache-control'), 'no-store')
})

test('GET: 구글이 갱신권을 거절(invalid_grant)하면 연결 안 됨 + 쿠키를 지운다', async () => {
  google = () => Response.json({ error: 'invalid_grant' }, { status: 400 })
  const res = await GET(req('GET', { cookie: `drive_rt=${await seal('1//dead', KEY)}` }))
  assert.equal((await res.json()).connected, false)
  assert.match(res.headers.get('set-cookie') ?? '', /Max-Age=0/)
})

test('GET: 위조된 쿠키는 구글에 묻지 않고 지운다', async () => {
  let asked = false
  google = () => { asked = true; return Response.json({}) }
  const res = await GET(req('GET', { cookie: 'drive_rt=forged' }))
  assert.equal((await res.json()).connected, false)
  assert.equal(asked, false)
  assert.match(res.headers.get('set-cookie') ?? '', /Max-Age=0/)
})

test('POST: 다른 사이트(또는 Origin 없음)에서 온 요청은 403', async () => {
  assert.equal((await POST(req('POST', { origin: 'https://evil.example', body: { code: 'c' } }))).status, 403)
  assert.equal((await POST(req('POST', { body: { code: 'c' } }))).status, 403)
})

test('POST: 코드를 토큰으로 바꾸고 갱신권은 잠가서 쿠키에만 둔다 (응답 본문에 없다)', async () => {
  google = (_url, body) => {
    assert.equal(body.get('redirect_uri'), 'postmessage')
    return Response.json({ access_token: 'ya29.a', expires_in: 3599, refresh_token: '1//fresh' })
  }
  const res = await POST(req('POST', { origin: SITE, body: { code: '4/abc' } }))
  const text = await res.text()
  assert.ok(!text.includes('1//fresh'))
  const cookie = /drive_rt=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')![1]
  assert.equal(await unseal(cookie, KEY), '1//fresh')
})

test('POST: 갱신권이 안 왔고 쿠키도 없으면 409 + 받은 허락을 철회한다 (다음 로그인에서 갱신권이 온다)', async () => {
  const urls: string[] = []
  google = (url) => { urls.push(url); return url.includes('revoke') ? new Response('') : Response.json({ access_token: 'ya29.b', expires_in: 3599 }) }
  const res = await POST(req('POST', { origin: SITE, body: { code: '4/abc' } }))
  assert.equal(res.status, 409)
  assert.ok(urls.some((u) => u.includes('revoke')))
})

/**
 * 갱신권 없이 다시 로그인하는 구글 가짜: 코드 → 새 계정의 출입증(갱신권 없음), 옛 갱신권 → 옛 계정의 출입증,
 * 드라이브 계정 묻기 → 출입증마다의 계정 번호. 철회한 토큰은 `revoked`에 모은다.
 */
function relogin(accounts: Record<string, string>, revoked: string[], oldRefresh: Response = Response.json({ access_token: 'ya29.old', expires_in: 3599 })) {
  google = (url, body, auth) => {
    if (url.includes('revoke')) { revoked.push(body.get('token') ?? ''); return new Response('') }
    if (url.includes('/drive/v3/about')) {
      const id = accounts[auth.replace('Bearer ', '')]
      return id ? Response.json({ user: { permissionId: id } }) : Response.json({}, { status: 401 })
    }
    if (body.get('grant_type') === 'refresh_token') return oldRefresh.clone()
    return Response.json({ access_token: 'ya29.new', expires_in: 3599 })
  }
}

test('POST: 갱신권이 안 왔고 옛 쿠키가 같은 계정의 것이면 그 쿠키를 이어 쓴다', async () => {
  const revoked: string[] = []
  relogin({ 'ya29.new': 'acct-A', 'ya29.old': 'acct-A' }, revoked)
  const old = await seal('1//old-A', KEY)
  const res = await POST(req('POST', { origin: SITE, cookie: `drive_rt=${old}`, body: { code: '4/abc' } }))
  assert.equal(res.status, 200)
  assert.equal((await res.json()).accessToken, 'ya29.new')
  assert.equal(/drive_rt=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')![1], old)
  assert.deepEqual(revoked, [])
})

test('POST: 갱신권이 안 왔고 옛 쿠키가 다른 계정의 것이면 쓰지 않는다 — 409, 옛 쿠키를 지우고 새 허락만 철회한다', async () => {
  const revoked: string[] = []
  relogin({ 'ya29.new': 'acct-B', 'ya29.old': 'acct-A' }, revoked)
  const res = await POST(req('POST', { origin: SITE, cookie: `drive_rt=${await seal('1//old-A', KEY)}`, body: { code: '4/abc' } }))
  assert.equal(res.status, 409)
  assert.match(res.headers.get('set-cookie') ?? '', /drive_rt=; .*Max-Age=0/)
  // 옛 계정의 갱신권은 철회하지 않는다 (그 계정의 다른 기기가 쓰고 있을 수 있다)
  assert.deepEqual(revoked, ['ya29.new'])
})

test('POST: 옛 쿠키의 갱신권이 죽었으면 쓰지 않는다 — 409 + 옛 쿠키를 지운다', async () => {
  const revoked: string[] = []
  relogin({ 'ya29.new': 'acct-A' }, revoked, Response.json({ error: 'invalid_grant' }, { status: 400 }))
  const res = await POST(req('POST', { origin: SITE, cookie: `drive_rt=${await seal('1//dead', KEY)}`, body: { code: '4/abc' } }))
  assert.equal(res.status, 409)
  assert.match(res.headers.get('set-cookie') ?? '', /Max-Age=0/)
})

test('POST: 계정을 확인하지 못하면(드라이브가 거절) 옛 쿠키를 쓰지도 지우지도 않는다 — 502', async () => {
  const revoked: string[] = []
  relogin({ 'ya29.old': 'acct-A' }, revoked) // 새 출입증의 계정 묻기만 401
  const res = await POST(req('POST', { origin: SITE, cookie: `drive_rt=${await seal('1//old-A', KEY)}`, body: { code: '4/abc' } }))
  assert.equal(res.status, 502)
  assert.equal(res.headers.get('set-cookie'), null)
  assert.ok(!(await res.text()).includes('ya29'))
})

test('DELETE: 갱신권을 철회하고 쿠키를 지운다', async () => {
  let revoked = ''
  google = (url, body) => { if (url.includes('revoke')) revoked = body.get('token') ?? ''; return new Response('') }
  const res = await DELETE(req('DELETE', { origin: SITE, cookie: `drive_rt=${await seal('1//bye', KEY)}` }))
  assert.equal(revoked, '1//bye')
  assert.match(res.headers.get('set-cookie') ?? '', /Max-Age=0/)
})
