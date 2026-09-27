/**
 * 구글 로그인 창(Google Identity Services, 코드 모델·팝업 방식). 권한은 `drive.file` — **이 앱이 만든 파일만** 보고 고친다.
 * 스크립트는 드라이브 카드가 보일 때 미리 불러 둔다(`preloadGis`): 버튼을 누른 뒤에 불러오면 그 사이 "사용자가 누름"이 끊겨
 * 브라우저가 팝업을 막는다.
 */
const SCRIPT = 'https://accounts.google.com/gsi/client'
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'

/** GIS 코드 모델에서 쓰는 만큼만 적은 타입 */
interface CodeClient { requestCode: () => void }
interface Gis {
  accounts: { oauth2: { initCodeClient: (config: {
    client_id: string
    scope: string
    ux_mode: 'popup'
    callback: (r: { code?: string; error?: string }) => void
    error_callback?: (e: { type?: string }) => void
  }) => CodeClient } }
}

let loading: Promise<Gis> | null = null

/** GIS 스크립트를 한 번만 불러온다. 막혔거나(광고 차단 등) 실패하면 한국어 Error로 거절하고 다음에 다시 시도한다 */
export function preloadGis(): Promise<Gis> {
  loading ??= new Promise<Gis>((resolve, reject) => {
    const found = (window as unknown as { google?: Gis }).google
    if (found?.accounts?.oauth2) { resolve(found); return }
    const el = document.createElement('script')
    el.src = SCRIPT
    el.async = true
    el.onload = () => resolve((window as unknown as { google: Gis }).google)
    el.onerror = () => { loading = null; el.remove(); reject(new Error('구글 로그인 창을 불러오지 못했습니다 (광고 차단기나 인터넷 연결을 확인하세요).')) }
    document.head.appendChild(el)
  })
  return loading
}

/**
 * 로그인 창을 열어 코드를 받는다. 사용자가 창을 닫으면 '취소'라는 한국어 Error로 거절한다.
 * 스크립트가 아직 없으면(미리 불러오기 전) 불러온 뒤 연다 — 이때는 팝업이 막힐 수 있어 그 안내로 거절될 수 있다.
 */
export async function requestCode(clientId: string): Promise<string> {
  const gis = await preloadGis()
  return new Promise<string>((resolve, reject) => {
    const client = gis.accounts.oauth2.initCodeClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      ux_mode: 'popup',
      callback: (r) => (r.code ? resolve(r.code) : reject(new Error(r.error === 'access_denied' ? '드라이브 권한을 허락하지 않아 연결하지 않았습니다.' : '구글 로그인이 끝나지 않았습니다.'))),
      error_callback: (e) => reject(new Error(e.type === 'popup_failed_to_open' ? '브라우저가 로그인 창을 막았습니다. 팝업을 허용한 뒤 다시 눌러 주세요.' : '로그인을 취소했습니다.')),
    })
    client.requestCode()
  })
}
