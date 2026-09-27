/**
 * 구글 드라이브 REST v3를 fetch로 직접 부른다 (라이브러리 없음). 브라우저 → 구글로 곧장 가고, 이 사이트의 서버를 지나지 않는다.
 * 권한이 `drive.file`이라 이 앱이 만든 파일·폴더만 보인다 — 사용자의 다른 파일은 목록에도 나오지 않는다.
 *
 * 실패 규칙: 401은 출입증을 새로 받아 **한 번만** 다시 하고, 그래도 401이면 NotConnectedError.
 * 그 밖의 실패는 DriveError(status 포함) — 부르는 쪽(동기화)이 다시 시도할지 정한다.
 */
import { accessToken, NotConnectedError } from './driveAuth'

const API = 'https://www.googleapis.com/drive/v3/files'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'
const FOLDER = 'application/vnd.google-apps.folder'

/** 드라이브가 거절한 요청. status 0은 네트워크가 끊긴 것 */
export class DriveError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

/** 드라이브 파일 한 개 — 목록에서 쓰는 만큼만 */
export interface DriveFile {
  id: string
  name: string
  /** 파일에 붙인 작은 꼬리표 (기록 파일의 updatedAt·지움 표시) */
  appProperties?: Record<string, string>
}

/**
 * 출입증을 붙여 요청한다. 401이면 출입증을 새로 받아 한 번 더. 네트워크 실패·거절은 DriveError.
 * 요청 하나에 60초 상한 — 폰이 잠들어 연결이 걸린 채 멈추면 동기화 전체가 영원히 "하는 중"이 된다.
 */
async function call(url: string, init: RequestInit = {}): Promise<Response> {
  for (const force of [false, true]) {
    const headers = new Headers(init.headers)
    headers.set('authorization', `Bearer ${await accessToken(force)}`)
    let res: Response
    try {
      res = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(60_000) })
    } catch {
      throw new DriveError('드라이브에 닿지 못했습니다 (인터넷 연결을 확인하세요).', 0)
    }
    if (res.status === 401) continue
    if (!res.ok) throw new DriveError(`드라이브가 요청을 거절했습니다 (${res.status}).`, res.status)
    return res
  }
  throw new NotConnectedError()
}

/** 드라이브 검색식 안의 글자를 감싼다 (작은따옴표·역슬래시) */
function quote(text: string): string {
  return `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

/**
 * 폴더 안의 파일을 전부 나열한다 (휴지통 제외, 1,000개씩 쪽을 넘긴다).
 * `parentId`를 'root'로 주면 내 드라이브 맨 위.
 */
export async function listFiles(parentId: string, extraQuery = ''): Promise<DriveFile[]> {
  const out: DriveFile[] = []
  let pageToken = ''
  do {
    const q = `${quote(parentId)} in parents and trashed=false${extraQuery ? ` and ${extraQuery}` : ''}`
    const params = new URLSearchParams({ q, pageSize: '1000', fields: 'nextPageToken,files(id,name,appProperties)', spaces: 'drive' })
    if (pageToken) params.set('pageToken', pageToken)
    const data = (await (await call(`${API}?${params}`)).json()) as { files?: DriveFile[]; nextPageToken?: string }
    out.push(...(data.files ?? []))
    pageToken = data.nextPageToken ?? ''
  } while (pageToken)
  return out
}

/**
 * 폴더를 찾고, 없으면 만든다. 같은 이름이 여럿이면(두 기기가 동시에 만든 경우) 가장 먼저 찾은 것을 쓴다.
 * 만든 폴더의 id를 준다.
 */
export async function ensureFolder(name: string, parentId: string): Promise<string> {
  const found = await listFiles(parentId, `name=${quote(name)} and mimeType=${quote(FOLDER)}`)
  if (found[0]) return found[0].id
  const res = await call(`${API}?fields=id`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER, parents: [parentId] }),
  })
  return ((await res.json()) as { id: string }).id
}

/**
 * 파일 하나를 올린다 — `existingId`가 있으면 그 파일의 내용을 바꾸고, 없으면 새로 만든다.
 * 요청 하나(multipart)로 올린다: 드라이브는 끝까지 받은 뒤에만 파일을 만들거나 바꾸므로 도중에 끊겨도 반쪽 파일이 남지 않는다.
 * 파일 id를 준다.
 */
export async function uploadFile(opts: { name: string; parentId: string; blob: Blob; appProperties?: Record<string, string>; existingId?: string }): Promise<string> {
  const meta: Record<string, unknown> = { name: opts.name, mimeType: opts.blob.type || 'application/octet-stream' }
  if (opts.appProperties) meta.appProperties = opts.appProperties
  if (!opts.existingId) meta.parents = [opts.parentId]
  const body = new FormData()
  body.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }))
  body.append('file', opts.blob)
  const url = opts.existingId ? `${UPLOAD}/${opts.existingId}?uploadType=multipart&fields=id` : `${UPLOAD}?uploadType=multipart&fields=id`
  const res = await call(url, { method: opts.existingId ? 'PATCH' : 'POST', body })
  return ((await res.json()) as { id: string }).id
}

/** 파일 내용을 받는다 */
export async function downloadFile(id: string): Promise<Blob> {
  return (await call(`${API}/${id}?alt=media`)).blob()
}

/** 파일을 지운다 (휴지통을 거치지 않는다 — 이 앱이 만든 사본이다). 이미 없으면(404) 성공으로 본다 */
export async function deleteFile(id: string): Promise<void> {
  try {
    await call(`${API}/${id}`, { method: 'DELETE' })
  } catch (e) {
    if (!(e instanceof DriveError && e.status === 404)) throw e
  }
}
