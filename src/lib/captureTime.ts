/**
 * 저장한 기록의 촬영 시각을 사람이 고칠 때의 변환 (records/RecordEdit). 순수 함수다 (node --test로 검사한다).
 * 입력칸(`<input type="datetime-local">`)은 시간대 없는 벽시계 'YYYY-MM-DDTHH:mm'을 주고받고,
 * 기록은 UTC 순간(`capturedAt`)과 촬영지 오프셋(`capturedAtOffset`)으로 둔다 — lib/exif.ts가 사진에서 읽을 때와 같은 약속이다.
 */
// 확장자를 적는 이유: node --test가 이 파일을 직접 읽는다 (Vite는 어느 쪽이든 된다)
import { browserOffsetFor, normalizeOffset } from './exif.ts'
import { zonedParts } from './format.ts'

const pad = (n: number, width = 2) => String(n).padStart(width, '0')

/**
 * 기록의 촬영 시각 → 입력칸 값. 화면(`ui/when.ts dateTimeOf`)이 보여 주는 것과 같은 벽시계다 —
 * 오프셋이 있으면 촬영지 시각, 모르면(null) 브라우저 시간대. 초는 버린다 (입력칸이 분까지다).
 * 시각을 못 읽으면 '' (입력칸이 비어 보이고, 그대로 저장하려 하면 fromTimeInput이 막는다).
 */
export function toTimeInput(capturedAt: string, offset: string | null): string {
  const p = zonedParts(capturedAt, offset)
  if (!p) return ''
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`
}

/**
 * 입력칸 값 → 기록의 시각. 입력은 **기록의 오프셋** 기준 벽시계로 읽는다 — 화면이 그 기준으로 보여 줬다 (toTimeInput).
 * 브라우저 시간대로 읽으면 해외에서 찍은 기록이 시차만큼 밀린다.
 * - 오프셋을 모르는 기록(null)에는 **입력한 날짜의** 브라우저 오프셋을 붙인다 — 사람이 적은 시각은 그 사람이 있는 곳의 시각이고,
 *   한 번 고친 시각은 어느 시간대에서 열어도 같게 보여야 한다. 여름·겨울 시간이 있는 곳은 그날 정오의 오프셋이다 (browserOffsetFor).
 * - 오프셋이 있는 기록은 그 오프셋을 그대로 둔다. 날짜를 여름↔겨울 시간 너머로 옮기면 UTC가 한 시간 어긋날 수 있다 (보이는 시각은 맞다).
 * - 초는 입력칸이 주면 쓰고, 없으면 0.
 * 형식이 어긋나거나(빈칸 포함) 없는 날짜·시각(2월 30일, 24시)이면 null — 부르는 쪽이 저장을 막는다.
 */
export function fromTimeInput(value: string, offset: string | null): { capturedAt: string; capturedAtOffset: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value)
  if (!m) return null
  const [, Y, Mo, D, h, mi, s = '00'] = m
  const off = (offset ? normalizeOffset(offset) : null) ?? browserOffsetFor(Number(Y), Number(Mo), Number(D))
  const at = new Date(`${Y}-${Mo}-${D}T${h}:${mi}:${s}.000${off}`)
  if (Number.isNaN(at.getTime())) return null
  const capturedAt = at.toISOString()
  // Date는 2월 30일을 3월 2일로, 24:00을 다음 날 0시로 말없이 넘긴다 — 되돌려 읽어 입력과 같을 때만 받는다
  if (toTimeInput(capturedAt, off) !== `${Y}-${Mo}-${D}T${h}:${mi}`) return null
  return { capturedAt, capturedAtOffset: off }
}
