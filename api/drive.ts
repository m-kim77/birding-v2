/**
 * 구글 드라이브 연결의 통로 (Vercel 함수). **기록·사진은 여기를 지나지 않는다** — 브라우저가 드라이브에 직접 올리고 받는다.
 * 여기서는 출입증만 다룬다: 로그인 코드를 토큰으로 바꾸고, 갱신권을 잠가 사용자 쿠키에 두고, 그 쿠키로 새 출입증을 준다.
 * 갱신권은 서버·DB·로그에 남지 않는다 (쿠키는 HttpOnly라 화면 코드도 읽지 못한다).
 *
 * - GET    → { configured, clientId, connected, accessToken?, expiresIn? } — 쿠키가 있으면 새 출입증을 받아 준다
 * - POST   { code } → { connected, accessToken, expiresIn } — 로그인 창의 코드를 바꾸고 쿠키를 둔다
 *          (갱신권이 오지 않으면 이 브라우저의 옛 쿠키를 이어 쓰되, 같은 구글 계정의 것일 때만)
 * - DELETE → 구글에서 갱신권을 철회하고 쿠키를 지운다
 *
 * 환경변수: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, DRIVE_COOKIE_KEY(base64 32바이트).
 *
 * 최대 실행 시간: POST는 구글을 많으면 넷 차례로 기다린다 (코드 → 옛 갱신권 → 계정 묻기 둘을 함께 → 새 허락 철회, 하나마다 많아야
 * `GOOGLE_TIMEOUT_MS`). `vercel.json`의 maxDuration은 그 합보다 길어야 한다 — 짧으면 느린 날 Vercel이 먼저 끊어 한국어 안내도
 * 쿠키 정리도 없이 끝난다. 차례를 더하면 그 값도 같이 늘린다 (test/driveAuth.test.ts가 잰다). 평소에는 차례마다 수백 ms다.
 */
// 경로에 .ts를 적는다 — 확장자 없는 경로는 배포된 함수에서 못 찾는다 (CLAUDE.md)
import { readCookie, seal, unseal } from './_lib/cookieSeal.ts'
import { accountOf } from './_lib/driveAccount.ts'
import { RevokedError, exchangeCode, refreshAccess, revoke } from './_lib/googleOAuth.ts'
import { sameOrigin } from './_lib/origin.ts'

const COOKIE = 'drive_rt'
/** 쿠키 수명. 구글 갱신권은 6개월 안 쓰면 죽으므로 그 정도로 둔다. 쓸 때마다 다시 적어 늘린다 */
const COOKIE_DAYS = 180

/** 한국어 안내와 함께 JSON 오류 응답을 만든다. `cookie`를 주면 그 쿠키 헤더도 붙인다 (옛 쿠키 지우기) */
function fail(status: number, message: string, cookie?: string): Response {
  const headers: Record<string, string> = { 'cache-control': 'no-store' }
  if (cookie) headers['set-cookie'] = cookie
  return Response.json({ error: { message } }, { status, headers })
}

/**
 * 쿠키 헤더 값. 이 경로(/api/drive)에만 가고, 다른 사이트에서 시작한 요청에는 붙지 않는다(SameSite=Strict).
 * localhost(개발)에서는 Secure를 뺀다 — http라 사파리가 Secure 쿠키를 받지 않는다.
 */
function cookieHeader(request: Request, value: string, days: number): string {
  const secure = new URL(request.url).hostname === 'localhost' ? '' : '; Secure'
  return `${COOKIE}=${value}; Path=/api/drive; Max-Age=${days * 86400}; HttpOnly; SameSite=Strict${secure}`
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
 * 옛 쿠키의 갱신권이 방금 로그인한 계정(`accessToken`)의 것인지 본다 — 두 출입증의 드라이브 계정 번호를 견준다.
 * 쿠키가 깨졌거나 그 갱신권이 죽었으면 false (쓰지 않고 버린다). 구글에 닿지 못하거나 계정을 확인해 주지 않으면 던진다 —
 * 확인하지 못한 갱신권은 쓰지 않는다 (부르는 쪽은 502로 답하고 쿠키를 그대로 둔다).
 */
async function sameAccount(oldSealed: string, accessToken: string): Promise<boolean> {
  const oldRefresh = await unseal(oldSealed, process.env.DRIVE_COOKIE_KEY)
  if (!oldRefresh) return false
  let oldAccess: string
  try {
    oldAccess = (await refreshAccess(oldRefresh)).accessToken
  } catch (e) {
    if (e instanceof RevokedError) return false
    throw e
  }
  const [now, before] = await Promise.all([accountOf(accessToken), accountOf(oldAccess)])
  return now === before
}

/**
 * 로그인 창의 코드를 토큰으로 바꾼다. 구글은 **처음 허락할 때만** 갱신권을 준다 —
 * 갱신권이 오지 않으면 이 브라우저의 옛 쿠키를 이어 쓰는데, **같은 구글 계정의 것일 때만** 쓴다.
 * 쿠키가 없거나 다른 계정의 것이면(구글 쪽에는 허락이 남았는데 이 브라우저는 모르는 경우) 옛 쿠키를 지우고 받은 허락을 철회한 뒤
 * 한국어로 풀어 알린다 (409 — 한 번 더 누르면 구글이 갱신권을 다시 준다).
 */
export async function POST(request: Request): Promise<Response> {
  // POST·DELETE는 쿠키를 바꾼다 — 다른 사이트의 폼·스크립트가 부르지 못하게 (SameSite 쿠키에 더한 두 번째 잠금, `_lib/origin.ts`)
  if (!sameOrigin(request)) return fail(403, '다른 사이트에서 온 요청입니다.')
  let code = ''
  try { code = String(((await request.json()) as { code?: unknown }).code ?? '') } catch { /* 아래에서 거절 */ }
  if (!code || code.length > 2048) return fail(400, '로그인 코드가 없습니다.')
  try {
    const t = await exchangeCode(code)
    const old = readCookie(request.headers.get('cookie'), COOKIE)
    // 기기 저장소만 지워지고 쿠키는 남은 브라우저에서 다른 계정으로 로그인하면, 옛 쿠키를 그대로 쓸 때
    // 1시간 뒤(출입증을 새로 받을 때)부터 옛 계정의 드라이브로 바뀌어 두 계정의 기록이 섞인다 — 그래서 계정을 견준다
    const keepOld = !t.refreshToken && old !== '' && (await sameAccount(old, t.accessToken))
    const sealed = t.refreshToken ? await seal(t.refreshToken, process.env.DRIVE_COOKIE_KEY) : keepOld ? old : ''
    if (!sealed) {
      await revoke(t.accessToken)
      // 다른 계정(또는 죽은) 옛 쿠키는 버리기만 한다 — 그 갱신권을 철회하면 그 계정 주인의 다른 기기 연결까지 끊길 수 있다
      return fail(409, '구글이 자동 연결 권한을 주지 않았습니다. 한 번 더 "구글로 로그인"을 눌러 주세요.', old ? cookieHeader(request, '', 0) : undefined)
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
