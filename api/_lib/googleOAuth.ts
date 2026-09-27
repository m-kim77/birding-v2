/**
 * 구글 OAuth 토큰 창구와의 세 가지 대화: 코드 → 토큰, 갱신권 → 새 출입증, 갱신권 철회.
 * 토큰 값은 로그에 찍지 않는다 (던지는 오류 문구에도 넣지 않는다).
 * 환경변수: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET — 비밀은 이 서버에만 있고 브라우저로 나가지 않는다.
 */
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'

export interface GoogleTokens {
  accessToken: string
  /** 출입증이 몇 초 뒤 풀리는지 (보통 3599) */
  expiresIn: number
  /** 처음 허락할 때만 온다. 이미 허락한 계정이 다시 로그인하면 없다 */
  refreshToken?: string
}

/** 갱신권이 더는 쓸 수 없을 때(사용자가 구글 계정에서 철회·6개월 미사용 등) 던진다 — 부르는 쪽은 쿠키를 지운다 */
export class RevokedError extends Error {}

/** 클라이언트 ID·비밀을 읽는다. 없으면 한국어 Error */
function credentials(): { id: string; secret: string } {
  const id = process.env.GOOGLE_CLIENT_ID ?? ''
  const secret = process.env.GOOGLE_CLIENT_SECRET ?? ''
  if (!id || !secret) throw new Error('GOOGLE_CLIENT_ID·GOOGLE_CLIENT_SECRET 환경변수가 없습니다.')
  return { id, secret }
}

/**
 * 토큰 창구에 폼을 보내고 답을 읽는다.
 * invalid_grant(갱신권이 죽음)는 RevokedError, 그 밖의 실패는 한국어 Error (구글의 오류 설명은 토큰이 들어 있지 않아 붙인다).
 */
async function post(form: Record<string, string>): Promise<GoogleTokens> {
  const res = await fetch(TOKEN_URL, { method: 'POST', body: new URLSearchParams(form), signal: AbortSignal.timeout(10_000) })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    if (data.error === 'invalid_grant') throw new RevokedError('드라이브 연결이 끊겼습니다.')
    throw new Error(`구글 로그인 창구가 거절했습니다 (${String(data.error ?? res.status)}).`)
  }
  return {
    accessToken: String(data.access_token ?? ''),
    expiresIn: Number(data.expires_in) || 3599,
    refreshToken: typeof data.refresh_token === 'string' ? data.refresh_token : undefined,
  }
}

/**
 * 브라우저의 구글 로그인 창(팝업 방식)이 준 코드를 토큰으로 바꾼다.
 * 팝업 방식의 코드는 redirect_uri가 'postmessage'로 약속돼 있다 (구글 Identity Services 코드 모델).
 */
export function exchangeCode(code: string): Promise<GoogleTokens> {
  const { id, secret } = credentials()
  return post({ code, client_id: id, client_secret: secret, redirect_uri: 'postmessage', grant_type: 'authorization_code' })
}

/** 갱신권으로 새 출입증(1시간)을 받는다. 갱신권이 죽었으면 RevokedError */
export function refreshAccess(refreshToken: string): Promise<GoogleTokens> {
  const { id, secret } = credentials()
  return post({ refresh_token: refreshToken, client_id: id, client_secret: secret, grant_type: 'refresh_token' })
}

/** 갱신권을 구글에서 철회한다 (연결 끊기). 실패해도 던지지 않는다 — 쿠키는 어차피 지운다 */
export async function revoke(token: string): Promise<void> {
  try {
    await fetch(REVOKE_URL, { method: 'POST', body: new URLSearchParams({ token }), signal: AbortSignal.timeout(10_000) })
  } catch { /* 네트워크 실패 — 사용자는 구글 계정 페이지에서도 끊을 수 있다 */ }
}
