/**
 * 저장 공간 카드(settings/StorageSection)의 문구와 줄을 만드는 순수 함수. node --test로 검사한다.
 */
// 확장자를 적는 이유: node --test가 이 파일을 직접 읽는다 (Vite는 어느 쪽이든 된다)
import { newestFirst } from '../../lib/timeOrder.ts'
import type { MissingPhotos } from '../../data/photoCheck'
import type { PhotoKind, Sighting } from '../../types'

/**
 * 쓰는 양이 한도의 이만큼을 넘으면 알린다. 평소 한도는 기기 전체 용량의 약 60%라(크롬·사파리, MDN "Storage quotas")
 * 여기에 닿는 것은 사생활 보호 창처럼 한도가 작을 때다.
 */
export const NEAR_QUOTA = 0.8

const KB = 1024
const MB = KB * 1024
const GB = MB * 1024

/** 소수 한 자리, 끝의 '.0'은 뗀다 ('1.0' → '1') */
function oneDecimal(x: number): string {
  return x.toFixed(1).replace(/\.0$/, '')
}

/**
 * 바이트 수를 짧게: '850KB' · '4.2MB' · '48MB' · '1.3GB'. 브라우저가 주는 값이 어림값이라 소수는 10MB 미만과 GB에서 한 자리만.
 * 반올림이 단위를 넘으면 위 단위로 올린다 ('1024KB'·'1024MB'로 적지 않는다). 0·음수·NaN은 '0KB' (화면에 NaN을 내지 않는다).
 */
export function bytesText(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0KB'
  const kb = Math.max(1, Math.round(n / KB))
  if (kb < 1024) return `${kb}KB`
  const mb = n / MB
  if (mb < 9.95) return `${oneDecimal(mb)}MB`
  if (Math.round(mb) < 1024) return `${Math.round(mb)}MB`
  return `${oneDecimal(n / GB)}GB`
}

/** 브라우저가 알려 준 쓰는 양·한도(바이트). 알려 주지 않은 값은 null */
export interface UsageEstimate {
  usage: number | null
  quota: number | null
}

/**
 * 쓰는 양 한 줄. 쓰는 양을 모르면 null (부르는 쪽이 "알려 주지 않습니다"로 쓴다).
 * **한도는 평소 적지 않는다** — 크롬·사파리는 기기 전체 용량의 비율로 정해서 "남은 공간"이 아니다
 * (빈 공간이 2GB뿐인 폰에서도 수십 GB로 나온다). 쓰는 양이 한도의 80%를 넘을 때만 한도를 함께 적고 warn으로 알린다.
 */
export function usageLine(e: UsageEstimate): { text: string; tone: 'plain' | 'warn' } | null {
  if (e.usage === null) return null
  const used = `약 ${bytesText(e.usage)}를 쓰고 있습니다`
  if (e.quota && e.quota > 0 && e.usage / e.quota >= NEAR_QUOTA) {
    return { tone: 'warn', text: `${used} — 브라우저가 이 앱에 내준 공간(약 ${bytesText(e.quota)})이 거의 찼습니다. 먼저 백업해 두세요.` }
  }
  return { tone: 'plain', text: used }
}

/**
 * 사진이 빠진 기록의 "무엇이 없나". 큰 판이 없으면 상세 화면에, 작은 판이 없으면 목록에 사진 대신 자리 표시가 보인다.
 * 둘 다 아니면(부르는 쪽이 빈 목록을 넘긴 경우) 빈 문자열.
 */
export function missingKindsText(kinds: PhotoKind[]): string {
  const full = kinds.includes('full')
  const thumb = kinds.includes('thumb')
  if (full && thumb) return '사진 없음'
  if (full) return '큰 사진 없음'
  return thumb ? '목록 사진 없음' : ''
}

/** 사진이 빠진 기록 한 줄: 그 기록과 없는 판 */
export type MissingRow = { s: Sighting; kinds: PhotoKind[] }

/**
 * 사진이 빠진 기록(점검 결과)을 화면에 그릴 줄로 바꾼다.
 * 화면에 그릴 수 있는 기록만 — 점검(DB)과 화면 상태(journal)가 잠깐 어긋나도 없는 기록을 줄로 그리지 않는다.
 * 일지처럼 최신 촬영부터 (DB는 id 순으로 주는데, id는 무작위라 순서에 뜻이 없다). 빈 입력이면 빈 목록.
 * 촬영 시각은 글자가 아니라 순간으로 견준다 (lib/timeOrder.ts) — 못 읽는 시각은 맨 뒤, 같은 순간이면 점검이 준 순서.
 */
export function missingRows(missing: MissingPhotos[], sightings: Sighting[]): MissingRow[] {
  const byId = new Map(sightings.map((s) => [s.id, s]))
  return missing
    .flatMap((m) => { const s = byId.get(m.id); return s ? [{ s, kinds: m.kinds }] : [] })
    .sort((a, b) => newestFirst(a.s.capturedAt, b.s.capturedAt))
}
