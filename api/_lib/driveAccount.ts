/**
 * 드라이브 출입증이 어느 구글 계정의 것인지 묻는다 — 드라이브 about.get의 user.permissionId (drive.file 권한으로 부를 수 있다).
 * 이름·이메일은 묻지 않는다 (fields로 계정 번호 하나만 받는다). 출입증은 로그·오류 문구에 넣지 않는다.
 * 이 파일은 import가 없다 — `api/`와 node --test가 함께 읽는다.
 */
const ABOUT_URL = 'https://www.googleapis.com/drive/v3/about?fields=user(permissionId)'

/**
 * 출입증의 계정 번호를 준다. 드라이브에 닿지 못했거나, 거절했거나(401·403 등), 번호가 비어 있으면 한국어 Error를 던진다 —
 * 부르는 쪽은 "같은 계정인지 모른다"로 보고 옛 갱신권을 쓰지 않는다.
 */
export async function accountOf(accessToken: string): Promise<string> {
  let res: Response
  try {
    res = await fetch(ABOUT_URL, { headers: { authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(10_000) })
  } catch {
    throw new Error('구글 드라이브에 닿지 못했습니다.')
  }
  const data = (await res.json().catch(() => ({}))) as { user?: { permissionId?: unknown } }
  const id = data.user?.permissionId
  if (!res.ok || typeof id !== 'string' || !id) throw new Error(`구글 드라이브가 계정을 확인해 주지 않았습니다 (${res.status}).`)
  return id
}
