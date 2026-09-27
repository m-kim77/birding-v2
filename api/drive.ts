/**
 * 구글 드라이브 연결의 통로 (Vercel 함수). **기록·사진은 여기를 지나지 않는다** — 브라우저가 드라이브에 직접 올리고 받는다.
 * 여기서는 출입증만 다룬다: 로그인 코드를 토큰으로 바꾸고, 갱신권을 잠가 사용자 쿠키에 두고, 그 쿠키로 새 출입증을 준다.
 * 갱신권은 서버·DB·로그에 남지 않는다 (쿠키는 HttpOnly라 화면 코드도 읽지 못한다).
 *
 * - GET    → { configured, clientId, connected, accessToken?, expiresIn? } — 쿠키가 있으면 새 출입증을 받아 준다
 * - POST   { code } → { connected, accessToken, expiresIn } — 로그인 창의 코드를 바꾸고 쿠키를 둔다
 * - DELETE → 구글에서 갱신권을 철회하고 쿠키를 지운다
 *
 * 환경변수: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, DRIVE_COOKIE_KEY(base64 32바이트).
 */
// 경로에 .ts를 적는다 — 확장자 없는 경로는 배포된 함수에서 못 찾는다 (CLAUDE.md)
import { readCookie, seal, unseal } from './_lib/cookieSeal.ts'
import { RevokedError, exchangeCode, refreshAccess, revoke } from './_lib/googleOAuth.ts'

const COOKIE = 'drive_rt'
/** 쿠키 수명. 구글 갱신권은 6개월 안 쓰면 죽으므로 그 정도로 둔다. 쓸 때마다 다시 적어 늘린다 */
const COOKIE_DAYS = 180

/** 한국어 안내와 함께 JSON 오류 응답을 만든다 */
function fail(status: number, message: string): Response {
  return Response.json({ error: { message } }, { status, headers: { 'cache-control': 'no-store' } })
}

/**
 * 쿠키 헤더 값. 이 경로(/api/drive)에만 가고, 다른 사이트에서 시작한 요청에는 붙지 않는다(SameSite=Strict).
 * localhost(개발)에서는 Secure를 뺀다 — http라 사파리가 Secure 쿠키를 받지 않는다.
 */
function cookieHeader(request: Request, value: string, days: number): string {
  const secure = new URL(request.url).hostname === 'localhost' ? '' : '; Secure'
  return `${COOKIE}=${value}; Path=/api/drive; Max-Age=${days * 86400}; HttpOnly; SameSite=Strict${secure}`
}

/**
 * 같은 사이트에서 온 요청인지. POST·DELETE는 쿠키를 바꾸므로 다른 사이트의 폼·스크립트가 부르지 못하게 막는다
 * (SameSite 쿠키에 더한 두 번째 잠금). Origin이 없는 요청(오래된 브라우저 등)도 거절한다.
 */
function sameOrigin(request: Request): boolean {
  return request.headers.get('origin') === new URL(request.url).origin
}

/** JSON 응답 — 출입증이 들어 있으니 어디에도 캐시하지 않는다 */
function ok(body: unknown, cookie?: string): Response {
  const headers: Record<string, string> = { 'cache-control': 'no-store' }
  if (cookie) headers['set-cookie'] = cookie
  return Response.json(body, { headers })
}

/**
 * 설정 상태와, 연결돼 있으면 새 출입증. 갱신권이 죽었으면 쿠키를 지우고 connected:false.
 * 환경변수가 없으면 configured:false — 화면은 드라이브 버튼을 만들지 않는다.
 */
export async function GET(request: Request): Promise<Response> {
  const clientId = process.env.GOOGLE_CLIENT_ID ?? ''
  if (!clientId || !process.env.GOOGLE_CLIENT_SECRET || !process.env.DRIVE_COOKIE_KEY) return ok({ configured: false, clientId: '', connected: false })
  const sealed = readCookie(request.headers.get('cookie'), COOKIE)
  if (!sealed) return ok({ configured: true, clientId, connected: false })
  const refreshToken = await unseal(sealed, process.env.DRIVE_COOKIE_KEY)
  if (!refreshToken) return ok({ configured: true, clientId, connected: false }, cookieHeader(request, '', 0))
  try {
    const t = await refreshAccess(refreshToken)
    return ok({ configured: true, clientId, connected: true, accessToken: t.accessToken, expiresIn: t.expiresIn }, cookieHeader(request, sealed, COOKIE_DAYS))
  } catch (e) {
    if (e instanceof RevokedError) return ok({ configured: true, clientId, connected: false }, cookieHeader(request, '', 0))
    return fail(502, e instanceof Error ? e.message : '구글에 닿지 못했습니다.')
  }
}

/**
 * 로그인 창의 코드를 토큰으로 바꾼다. 구글은 **처음 허락할 때만** 갱신권을 준다 —
 * 갱신권이 오지 않았는데 쿠키도 없으면(구글 쪽에는 허락이 남았는데 이 브라우저는 모르는 경우) 한국어로 풀어 알린다.
 */
export async function POST(request: Request): Promise<Response> {
  if (!sameOrigin(request)) return fail(403, '다른 사이트에서 온 요청입니다.')
  let code = ''
  try { code = String(((await request.json()) as { code?: unknown }).code ?? '') } catch { /* 아래에서 거절 */ }
  if (!code || code.length > 2048) return fail(400, '로그인 코드가 없습니다.')
  try {
    const t = await exchangeCode(code)
    const old = readCookie(request.headers.get('cookie'), COOKIE)
    const sealed = t.refreshToken ? await seal(t.refreshToken, process.env.DRIVE_COOKIE_KEY) : old
    if (!sealed) {
      await revoke(t.accessToken)
      return fail(409, '구글이 자동 연결 권한을 주지 않았습니다. 한 번 더 "구글로 로그인"을 눌러 주세요.')
    }
    return ok({ connected: true, accessToken: t.accessToken, expiresIn: t.expiresIn }, cookieHeader(request, sealed, COOKIE_DAYS))
  } catch (e) {
    return fail(502, e instanceof Error ? e.message : '구글 로그인을 마치지 못했습니다.')
  }
}

/**
 * 연결 끊기: 갱신권을 구글에서 철회하고 쿠키를 지운다. 쿠키가 깨졌거나 없어도 지우기는 성공으로 답한다.
 * 철회하면 다음 로그인에서 구글이 갱신권을 다시 준다.
 */
export async function DELETE(request: Request): Promise<Response> {
  if (!sameOrigin(request)) return fail(403, '다른 사이트에서 온 요청입니다.')
  const sealed = readCookie(request.headers.get('cookie'), COOKIE)
  const refreshToken = sealed && process.env.DRIVE_COOKIE_KEY ? await unseal(sealed, process.env.DRIVE_COOKIE_KEY) : null
  if (refreshToken) await revoke(refreshToken)
  return ok({ connected: false }, cookieHeader(request, '', 0))
}
