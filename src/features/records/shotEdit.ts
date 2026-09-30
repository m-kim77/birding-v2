/**
 * 저장한 기록의 촬영 정보(`Sighting.shot`) — '수정' 칸에서 고치는 규칙과, 고친 값과 그 표시를 보여 주는 상세의 한 줄. 순수 함수다 (node --test로 검사한다).
 * 고치기는 editPatch와 같은 원칙이다 — **바뀐 것만 넣고**, 손대지 않은 칸은 저장된 값을 그대로 두고, 읽을 수 없는 칸이 있으면 저장을 막는다.
 * lib/format.ts만 부른다 — 기록 상세와 함께 첫 화면 묶음에 들어가므로 lib/exif.ts(→ 사진 정보 라이브러리)를 끌어오지 않는다.
 */
import type { ShotInfo, Sighting } from '../../types'
// 확장자를 적는 이유: node --test가 이 파일을 직접 읽는다 (Vite는 어느 쪽이든 된다)
import { formatExposure, formatShot, parseExposure } from '../../lib/format.ts'

/** 수정 칸의 여섯 칸 — 모두 입력한 글자 그대로 (앞뒤 공백은 readShotForm이 뗀다) */
export interface ShotForm {
  camera: string
  lens: string
  /** 초점거리 (mm). '400mm'처럼 단위를 붙여도 된다 */
  focal: string
  /** 조리개 — f/ 뒤의 숫자. 'f/6.3'처럼 적어도 된다 */
  fNumber: string
  /** 셔터 — 카메라 표기('1/200s')나 초('0.5', '2s', '2"') */
  exposure: string
  /** 양의 정수. 'ISO 1000'처럼 적어도 된다 */
  iso: string
}

/** 칸 이름 — 읽을 수 없는 칸을 가리킬 때 쓴다 */
export type ShotField = keyof ShotForm

/** 글자 칸과 저장 키의 짝 */
const TEXT = { camera: 'cameraModel', lens: 'lensModel' } as const
/** 숫자 칸과 저장 키의 짝. 이 순서가 `bad`의 순서다 (화면의 칸 순서와 같다) */
const NUM = { focal: 'focalLength', fNumber: 'fNumber', exposure: 'exposureTime', iso: 'iso' } as const
type TextField = keyof typeof TEXT
type NumField = keyof typeof NUM

/**
 * 0보다 큰 소수만 — '400', '6.3', '.5'. 빈칸·글자·0·음수는 null.
 * 숫자와 점만으로 된 글자만 받는다 — '1e3'·'0x10'처럼 Number()가 숫자로 읽어 주는 다른 모양은 받지 않는다 (lib/count.ts와 같은 이유).
 */
function positive(text: string): number | null {
  if (!/^(\d+\.?\d*|\.\d+)$/.test(text)) return null
  const n = Number(text)
  return n > 0 ? n : null
}

/** 숫자 칸마다 글자를 저장할 숫자로 읽는 법. 읽을 수 없으면 null. 화면의 표기에 붙는 단위('mm'·'f/'·'ISO')는 적어도 된다 */
const READ: Record<NumField, (text: string) => number | null> = {
  focal: (t) => positive(t.replace(/\s*mm$/i, '')),
  fNumber: (t) => positive(t.replace(/^f\s*\/?\s*/i, '')),
  // 셔터는 초 단위 실수로 저장한다 — 역수를 정수로 반올림하지 않는 규칙은 parseExposure가 지킨다 (CLAUDE.md).
  // 모양('1/200s'·'0.5'·'2"')을 먼저 본다 — parseExposure는 Number()로 읽어 '1e3'(1000초)·'0x10'(16초)도 받는다 (positive와 같은 이유)
  exposure: (t) => (/^(1\s*\/\s*)?(\d+\.?\d*|\.\d+)\s*[s"″]?$/i.test(t) ? parseExposure(t) : null),
  iso: (t) => {
    const n = positive(t.replace(/^iso\s*/i, ''))
    return n !== null && Number.isInteger(n) ? n : null
  },
}

/**
 * 저장된 숫자를 칸의 글자로 — 셔터는 카메라 표기('1/200s'), 나머지는 숫자 그대로.
 * 셔터가 0 이하면(손으로 고친 백업 등) 표기가 말이 안 되므로(`1/Infinitys`) 숫자 그대로 둔다.
 */
function shown(field: NumField, n: number): string {
  return field === 'exposure' && n > 0 ? formatExposure(n) : String(n)
}

/** 수정 칸을 열 때의 글자 — 지금의 촬영 정보 그대로. 없는 항목은 빈칸. 이 값을 그대로 shotPatch에 넣으면 빈 변경이다 */
export function shotFormOf(shot: ShotInfo): ShotForm {
  /** 숫자 칸 하나의 처음 글자 — 저장된 값이 없으면 빈칸 */
  const num = (field: NumField) => {
    const n = shot[NUM[field]]
    return n === undefined ? '' : shown(field, n)
  }
  return { camera: shot.cameraModel ?? '', lens: shot.lensModel ?? '', focal: num('focal'), fNumber: num('fNumber'), exposure: num('exposure'), iso: num('iso') }
}

/**
 * 수정 칸의 글자를 촬영 정보로 읽는다. `bad`는 읽을 수 없는 칸 (0·음수·글자, ISO의 소수) — 하나라도 있으면 저장하면 안 된다.
 * - 손대지 않은 칸(글자가 처음과 같음)은 **저장된 값 그대로** — 셔터 칸의 '1/1.3s'는 반올림된 표기라, 되읽으면 0.769초가 0.7692…초로 바뀐다
 *   (lib/format.ts exposureToSave와 같은 원칙). 저장된 값이 틀린 모양(ISO 0 등)이어도 손대지 않았으면 막지 않는다.
 * - 글자가 달라도 읽은 값의 표기가 처음 표기와 같으면(끝의 's'만 지움 등) 저장된 숫자 그대로.
 * - 비운 칸은 그 항목을 지운다 — **키 자체를 두지 않는다** (ShotInfo의 약속: 값이 없는 항목은 키가 없다. undefined를 넣지 않는다).
 * - 카메라·렌즈는 앞뒤 공백을 뗀다. 공백만 있으면 빈칸이다.
 * 결과에는 여섯 키만 담는다 (읽을 때 data/normalizeSighting.ts도 여섯 키만 남긴다).
 */
export function readShotForm(shot: ShotInfo, form: ShotForm): { shot: ShotInfo; bad: ShotField[] } {
  const start = shotFormOf(shot)
  const out: ShotInfo = {}
  const bad: ShotField[] = []
  for (const field of Object.keys(TEXT) as TextField[]) {
    const key = TEXT[field]
    const value = form[field] === start[field] ? shot[key] : form[field].trim() || undefined
    if (value !== undefined) out[key] = value
  }
  for (const field of Object.keys(NUM) as NumField[]) {
    const key = NUM[field]
    const was = shot[key]
    if (form[field] === start[field]) {
      if (was !== undefined) out[key] = was
      continue
    }
    const text = form[field].trim()
    if (!text) continue
    const n = READ[field](text)
    if (n === null) bad.push(field)
    else out[key] = was !== undefined && shown(field, n) === shown(field, was) ? was : n
  }
  return { shot: out, bad }
}

/** 여섯 항목의 값이 모두 같은지 */
function sameShot(a: ShotInfo, b: ShotInfo): boolean {
  return [...Object.values(TEXT), ...Object.values(NUM)].every((k) => a[k] === b[k])
}

/**
 * 수정 칸의 촬영 정보로 기록에 넣을 변경을 만든다 (records/RecordEdit가 editPatch의 변경과 합친다).
 * - 읽을 수 없는 칸이 있으면 **null** — 부르는 쪽이 저장을 막는다 (말없이 버리지 않는다).
 * - 읽은 결과가 지금의 촬영 정보와 같으면 빈 변경 `{}` — 고쳤다가 되돌린 경우도 같다 (기록을 건드리지 않아 `updatedAt`이 그대로다).
 * - 다르면 `shot` **전체**(새 객체)와 `shotEdited: true` — 저장소가 `{...기록, ...변경}`으로 얕게 합치므로, 일부만 넘기면
 *   나머지 항목이 사라지고 지운 항목은 남는다.
 */
export function shotPatch(s: Sighting, form: ShotForm): Partial<Sighting> | null {
  const { shot, bad } = readShotForm(s.shot, form)
  if (bad.length > 0) return null
  return sameShot(shot, s.shot) ? {} : { shot, shotEdited: true }
}

/**
 * 기록 상세(records/RecordDetail)의 촬영 정보 한 줄. 여섯 항목 중 하나라도 보일 것이 있으면 줄을 그린다 — 카메라·렌즈만 적은 기록도 보인다.
 * - 윗줄(main): `카메라 · 400mm · f/6.3 · 1/200s · ISO 1000` — 있는 것만 (숫자는 formatShot — 0 이하는 빠진다)
 * - 아랫줄(sub): 렌즈 이름과, 직접 고친 기록(`shotEdited`)이면 '직접 고친 촬영 정보입니다'. 없으면 ''.
 *   윗줄이 비면(렌즈만 있는 기록) 렌즈 이름이 윗줄로 올라간다.
 * 보일 것이 하나도 없으면 null (줄을 그리지 않는다 — 고친 표시만 있어도 그렇다). 카드의 한 줄(dex/cardText.ts)과 기록 화면의 줄(record/RecordFacts)은 따로다.
 */
export function shotFact(s: Pick<Sighting, 'shot' | 'shotEdited'>): { main: string; sub: string } | null {
  const { shot } = s
  const settings = formatShot({ focal_length: shot.focalLength, f_number: shot.fNumber, exposure_time: shot.exposureTime, iso: shot.iso })
  const lens = shot.lensModel?.trim() ?? ''
  const top = [shot.cameraModel?.trim(), settings].filter(Boolean).join(' · ')
  const main = top || lens
  if (!main) return null
  return { main, sub: [top ? lens : '', s.shotEdited ? '직접 고친 촬영 정보입니다' : ''].filter(Boolean).join(' · ') }
}
