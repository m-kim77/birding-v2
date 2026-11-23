/**
 * 드라이브 출입증이 어느 구글 계정의 것인지 묻는다 — 드라이브 about.get의 user.permissionId (drive.file 권한으로 부를 수 있다).
 * 이름·이메일은 묻지 않는다 (fields로 계정 번호 하나만 받는다). 출입증은 로그·오류 문구에 넣지 않는다.
 * `api/`와 node --test가 함께 읽는다.
 */
// 경로에 .ts를 적는다 — 확장자 없는 경로는 배포된 함수에서 못 찾는다 (CLAUDE.md)
import { GOOGLE_TIMEOUT_MS } from './googleOAuth.ts'

const ABOUT_URL = 'https://www.googleapis.com/drive/v3/about?fields=user(permissionId)'

/** 계정을 묻지 못했다. `status`는 드라이브의 HTTP 상태 번호 — 닿지 못했으면 0, 답은 왔는데 번호가 비었으면 그 답의 번호(보통 200) */
export class AccountError extends Error {
  status: number
  // 매개변수 속성(constructor(readonly status))은 쓰지 않는다 — node --test의 타입 지우기가 받지 않는다
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

/**
 * 출입증의 계정 번호를 준다. 드라이브에 닿지 못했거나, 거절했거나(401·403 등), 번호가 비어 있으면 한국어 AccountError를 던진다 —
 * 부르는 쪽은 "같은 계정인지 모른다"로 보고 옛 갱신권을 쓰지 않는다 (거절인지는 refusedByDrive로 가린다).
 */
export async function accountOf(accessToken: string): Promise<string> {
  let res: Response
  try {
    res = await fetch(ABOUT_URL, { headers: { authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS) })
  } catch {
    throw new AccountError('구글 드라이브에 닿지 못했습니다.', 0)
  }
  const data = (await res.json().catch(() => ({}))) as { user?: { permissionId?: unknown } }
  const id = data.user?.permissionId
  if (!res.ok || typeof id !== 'string' || !id) throw new AccountError(`구글 드라이브가 계정을 확인해 주지 않았습니다 (${res.status}).`, res.status)
  return id
}

/**
 * 드라이브가 그 출입증에는 계정을 알려 주지 않겠다고 거절했는지 (4xx — 그 계정의 드라이브가 꺼졌거나 드라이브 칸을 빼고 허락한 경우 등).
 * 기다리면 풀릴 수 있는 것(408·429), 닿지 못한 것(0), 구글 쪽 고장(5xx), 번호만 빈 답(200)은 거절이 아니다 — false.
 */
export function refusedByDrive(e: unknown): boolean {
  return e instanceof AccountError && e.status >= 400 && e.status < 500 && e.status !== 408 && e.status !== 429
}
