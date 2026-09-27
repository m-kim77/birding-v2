/**
 * 쿠키에 넣을 값을 잠그고 푸는 순수 함수 (AES-GCM). 구글 드라이브 갱신권(refresh token)을 **사용자 브라우저의 쿠키에만** 두려고 쓴다 —
 * 운영자 서버·DB에는 갱신권이 남지 않고, 쿠키를 훔쳐도 키(DRIVE_COOKIE_KEY) 없이는 읽을 수 없다.
 * GCM이라 한 글자라도 바뀐 쿠키는 풀리지 않는다 (위조 방지).
 * 이 파일은 import가 없다 — `api/`와 node --test가 함께 읽는다.
 */

/** base64url → 바이트. 형식이 틀리면 던진다 */
function fromB64(text: string): Uint8Array<ArrayBuffer> {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/')
  return new Uint8Array(Buffer.from(b64, 'base64'))
}

/** 바이트 → base64url (쿠키 값에 쓸 수 있는 글자만) */
function toB64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * 환경변수의 키(base64, 32바이트)를 AES 키로 바꾼다.
 * 없거나 32바이트가 아니면 한국어 Error를 던진다 — 짧은 키로 조용히 돌면 잠금이 약해진다.
 */
async function keyOf(keyB64: string | undefined): Promise<CryptoKey> {
  const raw = keyB64 ? fromB64(keyB64.trim()) : new Uint8Array(0)
  if (raw.length !== 32) throw new Error('DRIVE_COOKIE_KEY가 없거나 32바이트가 아닙니다 (openssl rand -base64 32로 만든다).')
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

/** 글자를 잠근다. 결과는 base64url(무작위 12바이트 + 암호문) — 같은 값도 잠글 때마다 다르게 나온다 */
export async function seal(plain: string, keyB64: string | undefined): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyOf(keyB64), new TextEncoder().encode(plain))
  const out = new Uint8Array(12 + data.byteLength)
  out.set(iv)
  out.set(new Uint8Array(data), 12)
  return toB64(out)
}

/**
 * 잠근 글자를 푼다. 바뀌었거나 다른 키로 잠갔거나 형식이 틀리면 null (던지지 않는다 — 부르는 쪽은 "연결 안 됨"으로 본다).
 * 키 자체가 없으면 그것은 운영 설정 오류라 던진다.
 */
export async function unseal(sealed: string, keyB64: string | undefined): Promise<string | null> {
  const key = await keyOf(keyB64)
  try {
    const bytes = fromB64(sealed)
    if (bytes.length < 13) return null
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, key, bytes.slice(12))
    return new TextDecoder().decode(plain)
  } catch {
    return null
  }
}

/** Cookie 헤더에서 이름 하나의 값을 꺼낸다. 없으면 '' */
export function readCookie(header: string | null, name: string): string {
  for (const part of (header ?? '').split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === name) return rest.join('=')
  }
  return ''
}
