/**
 * 드라이브 출입증(1시간짜리 access token)을 이 탭의 메모리에만 들고 있는다. 저장소·localStorage에 두지 않는다.
 * 갱신은 `/api/drive`가 사용자 쿠키의 잠근 갱신권으로 해 준다 — 그래서 로그인은 한 번이면 되고, 1시간마다 다시 누르지 않는다.
 */
import { requestCode } from './gis'

/** 연결이 없거나 끊겼다 — 동기화는 멈추고 화면은 "다시 연결"을 보인다. 다시 시도해도 소용없는 실패다 */
export class NotConnectedError extends Error {
  constructor() { super('구글 드라이브에 연결돼 있지 않습니다.') }
}

export interface DriveConfig {
  /** 운영자가 구글 설정(환경변수)을 마쳤는지. false면 드라이브 기능을 보이지 않는다 */
  configured: boolean
  clientId: string
  connected: boolean
}

interface TokenReply extends DriveConfig { accessToken?: string; expiresIn?: number }

let token = ''
/** 출입증이 풀리는 시각(ms) */
let expiresAt = 0
/** 진행 중인 갱신 요청 — 동시에 물어도 하나만 보낸다 */
let refreshing: Promise<DriveConfig> | null = null

/** 출입증을 기억한다. 풀리기 1분 전을 끝으로 잡는다 — 올리는 도중에 풀리지 않게 */
function remember(reply: { accessToken?: string; expiresIn?: number }): void {
  token = reply.accessToken ?? ''
  expiresAt = token ? Date.now() + ((reply.expiresIn ?? 3599) - 60) * 1000 : 0
}

/** 통로의 오류 응답에서 한국어 안내를 꺼낸다 */
async function failure(res: Response, fallback: string): Promise<Error> {
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
  return new Error(body?.error?.message ?? fallback)
}

/**
 * 설정 상태를 묻고, 연결돼 있으면 새 출입증도 받아 둔다. 네트워크가 끊겼으면 한국어 Error.
 * (연결 여부를 알려면 어차피 쿠키로 출입증을 받아 봐야 해서 둘을 한 요청으로 한다.)
 */
export async function loadDriveConfig(): Promise<DriveConfig> {
  let res: Response
  try { res = await fetch('/api/drive', { cache: 'no-store' }) } catch { throw new Error('인터넷에 연결돼 있지 않습니다.') }
  if (!res.ok) throw await failure(res, '드라이브 연결 상태를 확인하지 못했습니다.')
  const reply = (await res.json()) as TokenReply
  remember(reply)
  return { configured: reply.configured, clientId: reply.clientId, connected: reply.connected }
}

/**
 * 쓸 수 있는 출입증을 준다. 남아 있으면 그대로, 풀렸으면 `/api/drive`로 새로 받는다.
 * `force`면 남아 있어도 새로 받는다 (드라이브가 401을 줬을 때 — 구글 쪽에서 먼저 풀렸다).
 * 연결이 없으면 NotConnectedError.
 */
export async function accessToken(force = false): Promise<string> {
  if (!force && token && Date.now() < expiresAt) return token
  refreshing ??= loadDriveConfig().finally(() => { refreshing = null })
  const config = await refreshing
  if (!config.connected || !token) throw new NotConnectedError()
  return token
}

/**
 * 구글로 로그인해 드라이브를 연결한다 (로그인 창 → 코드 → `/api/drive`가 토큰으로 바꾸고 갱신권을 쿠키에 둔다).
 * 반드시 사용자가 누른 순간에 불러야 한다 (팝업). 취소·거절·실패는 한국어 Error.
 */
export async function connectDrive(clientId: string): Promise<void> {
  const code = await requestCode(clientId)
  const res = await fetch('/api/drive', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) })
  if (!res.ok) throw await failure(res, '드라이브 연결을 마치지 못했습니다.')
  remember((await res.json()) as TokenReply)
}

/** 연결을 끊는다 — 구글에서 권한을 철회하고 쿠키를 지운다. 네트워크 실패는 한국어 Error (출입증은 어쨌든 버린다) */
export async function disconnectDrive(): Promise<void> {
  remember({})
  const res = await fetch('/api/drive', { method: 'DELETE' }).catch(() => null)
  if (!res?.ok) throw new Error('연결을 끊지 못했습니다. 인터넷 연결을 확인하고 다시 눌러 주세요.')
}
