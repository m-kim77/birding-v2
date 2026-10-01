import Icon from '../../ui/Icon'
import type { ShotField, ShotForm } from './shotEdit'
import './shotEdit.css'

/** 칸 하나의 모양 — 이름, 폰 자판, 빈칸일 때의 예시, 읽을 수 없을 때 칸 아래에 적는 말 */
interface Spec {
  field: ShotField
  label: string
  /** 숫자 자판. 셔터는 '/'를 쳐야 해서 글자 자판 그대로 둔다 */
  inputMode?: 'decimal' | 'numeric'
  placeholder?: string
  /** 카메라·렌즈는 무엇이든 받으므로 없다 */
  bad?: string
}

/** 카메라·렌즈 — 한 줄에 하나 (이름이 길다) */
const TEXT: Spec[] = [
  { field: 'camera', label: '카메라' },
  { field: 'lens', label: '렌즈' },
]

/** 숫자 넷 — 두 칸씩. 순서는 카드·상세의 한 줄과 같다 (초점거리 · 조리개 · 셔터 · ISO) */
const NUMS: Spec[] = [
  { field: 'focal', label: '초점거리 (mm)', inputMode: 'decimal', placeholder: '예: 400', bad: '초점거리는 400처럼 0보다 큰 숫자로 적어 주세요.' },
  { field: 'fNumber', label: '조리개 (f/)', inputMode: 'decimal', placeholder: '예: 6.3', bad: '조리개는 6.3처럼 0보다 큰 숫자로 적어 주세요.' },
  { field: 'exposure', label: '셔터', placeholder: '예: 1/200', bad: '셔터는 1/200 또는 0.5처럼 적어 주세요.' },
  { field: 'iso', label: 'ISO', inputMode: 'numeric', placeholder: '예: 1000', bad: 'ISO는 1000처럼 0보다 큰 정수로 적어 주세요.' },
]

interface Props {
  /** 여섯 칸의 글자 — 부모(RecordEdit)가 든다 */
  value: ShotForm
  /** 읽을 수 없는 칸 (shotEdit.ts readShotForm). 그 칸 아래에 안내를 적는다 — 저장을 막는 것은 부모다 */
  bad: ShotField[]
  onChange: (next: ShotForm) => void
}

/**
 * 저장한 기록의 '수정' 안, 촬영 정보(카메라·렌즈·초점거리·조리개·셔터·ISO)를 고치는 접힌 칸. 그리기만 한다 — 읽는 규칙은 shotEdit.ts.
 * 접어 두는 이유: 거의 안 쓰는 칸 여섯이 늘 펼쳐져 있으면 폰에서 이름·시각·메모 고치기가 멀어진다.
 * 접힌 채로 틀린 칸이 있으면 '저장'이 꺼진 이유가 안 보이므로, 접힌 줄에도 한마디 적는다.
 */
export default function ShotFields({ value, bad, onChange }: Props) {
  /** 칸 하나 — 고친 글자를 여섯 칸 전체에 담아 부모에게 넘긴다 */
  const cell = (spec: Spec) => (
    <ShotInput key={spec.field} spec={spec} value={value[spec.field]} bad={bad.includes(spec.field)}
      onChange={(text) => onChange({ ...value, [spec.field]: text })} />
  )
  return (
    <details className="shot-edit">
      <summary>
        <Icon name="chevron" size={18} />촬영 정보 고치기
        {bad.length > 0 && <small>읽을 수 없는 칸이 있습니다</small>}
      </summary>
      <div className="shot-edit-body">
        <p className="hint">비운 칸은 지워집니다. 고치면 상세에 '직접 고친 촬영 정보'로 적히고, 사진에서 다시 읽어 올 수는 없습니다.</p>
        {TEXT.map(cell)}
        <div className="shot-nums">{NUMS.map(cell)}</div>
      </div>
    </details>
  )
}

/**
 * 칸 하나와, 읽을 수 없을 때 그 아래의 안내 한 줄.
 * 숫자 칸도 글자 칸(type=text)이다 — type=number는 틀린 글자를 빈 값으로 돌려줘 '지웠다'와 구분이 안 되고, PC에서 휠로 값이 바뀐다.
 */
function ShotInput({ spec, value, bad, onChange }: { spec: Spec; value: string; bad: boolean; onChange: (text: string) => void }) {
  return (
    <div className="shot-cell">
      <label className="field"><span>{spec.label}</span>
        <input type="text" inputMode={spec.inputMode} placeholder={spec.placeholder} aria-invalid={bad || undefined} value={value} onChange={(e) => onChange(e.target.value)} />
      </label>
      {bad && <p className="status-line is-warn" role="alert">{spec.bad}</p>}
    </div>
  )
}
