/**
 * 저장한 기록의 '수정' 칸(records/RecordEdit)이 기록에 넣을 변경. 순수 함수다 (node --test로 검사한다).
 * **바뀐 것만 넣는다** — 손대지 않은 칸은 저장된 값(초 단위 시각, 위치의 출처 등)을 그대로 두고,
 * 아무것도 안 바꿨으면 빈 변경이라 부르는 쪽이 기록을 건드리지 않는다 (그래도 쓰면 `updatedAt`이 바뀌어 "백업 안 된 기록"으로 세진다).
 */
import type { Sighting } from '../../types'
import type { PlaceValue } from '../record/usePlace'
// 확장자를 적는 이유: node --test가 이 파일을 직접 읽는다 (Vite는 어느 쪽이든 된다)
import { latinOf } from '../../data/species.ts'
import { fromTimeInput, toTimeInput } from '../../lib/captureTime.ts'
import { dexNoFor } from '../dex/dexNo.ts'

/** 수정 칸의 값 */
export interface EditForm {
  /** 입력한 글 그대로 (앞뒤 공백은 editPatch가 뗀다) */
  name: string
  note: string
  /** 입력칸 값 'YYYY-MM-DDTHH:mm' — 기록의 오프셋 기준 벽시계 (lib/captureTime.ts) */
  time: string
  /** 위치 시트가 정한 위치 */
  place: PlaceValue
}

/** 기록의 위치를 위치 시트가 쓰는 모양으로 */
export function placeOf(s: Sighting): PlaceValue {
  return { lat: s.lat, lng: s.lng, name: s.place, source: s.locationSource }
}

/** 수정 칸을 열 때의 값 — 지금의 기록 그대로. 이 값을 그대로 editPatch에 넣으면 빈 변경이다 */
export function formOf(s: Sighting): EditForm {
  return { name: s.speciesKo, note: s.note, time: toTimeInput(s.capturedAt, s.capturedAtOffset), place: placeOf(s) }
}

/**
 * 수정 칸의 값으로 기록에 넣을 변경을 만든다. `others`는 이 기록을 뺀 나머지 기록이다 (도감 번호를 다시 매길 때).
 * - 이름(앞뒤 공백 뺌)이 바뀌면 학명은 종 표에서 다시 찾고 AI 근거는 뗀다 — 근거는 그 이름에 대한 것이다 (buildSighting과 같은 원칙).
 *   도감 번호도 다시 매긴다. 이름을 비우면 '이름 미정'으로 돌아간다.
 * - 메모는 입력한 글 그대로 넣는다.
 * - 시각은 입력칸이 처음 값(toTimeInput)과 다를 때만 다시 계산한다 — 같으면 저장된 초·오프셋이 그대로 남는다.
 *   다시 계산할 수 없는 값(빈칸, 2월 30일)이면 **null** — 부르는 쪽이 저장을 막는다.
 * - 위치는 좌표·장소 이름·출처 중 하나라도 바뀌면 넷을 함께 넣는다 (이름만 늦게 도착한 경우도 바뀐 것이다).
 */
export function editPatch(s: Sighting, form: EditForm, others: Sighting[]): Partial<Sighting> | null {
  const name = form.name.trim()
  const renamed: Partial<Sighting> = name === s.speciesKo ? {} : {
    speciesKo: name, latin: latinOf(name), verdict: undefined, identify: name ? 'done' : 'none', dexNo: dexNoFor(name, others),
  }
  let retimed: Partial<Sighting> = {}
  if (form.time !== toTimeInput(s.capturedAt, s.capturedAtOffset)) {
    const time = fromTimeInput(form.time, s.capturedAtOffset)
    if (!time) return null
    retimed = time
  }
  const p = form.place
  const moved = p.lat !== s.lat || p.lng !== s.lng || p.name !== s.place || p.source !== s.locationSource
  return {
    ...renamed,
    ...(form.note !== s.note ? { note: form.note } : {}),
    ...retimed,
    ...(moved ? { place: p.name, lat: p.lat, lng: p.lng, locationSource: p.source } : {}),
  }
}

/**
 * 위치 시트의 "직전 기록 위치로"가 가리킬 위치 — `capturedAt`보다 먼저(같은 순간 포함) 찍은 기록 중 가장 늦은 것.
 * 위치가 없는 기록과 이 기록(`id`)은 뺀다. 없으면 null (시트가 그 버튼을 그리지 않는다).
 * 기록 화면(RecordFlow)은 마지막으로 **만든** 기록을 쓰지만, 저장한 기록을 고칠 때는 같은 탐조에서 바로 앞에 찍은 기록이 답이다 —
 * 지난달 기록을 고치는데 오늘 기록의 위치를 권하면 안 된다.
 * 시각은 글자가 아니라 순간으로 견준다 (백업에서 온 기록은 '+09:00'이 붙은 글자일 수 있다). 같은 순간이 여럿이면 목록에서 먼저 나온 것.
 * 출처는 '지도에서 직접 고름'으로 둔다 — RecordFlow의 직전 기록 위치와 같다 (사람이 골라 넣은 위치다).
 */
export function placeBefore(list: Sighting[], id: string, capturedAt: string): PlaceValue | null {
  const until = Date.parse(capturedAt)
  let best: Sighting | null = null
  let bestAt = -Infinity
  for (const x of list) {
    const at = Date.parse(x.capturedAt)
    // until이 NaN이면 비교가 모두 거짓이라 아무것도 고르지 않는다
    if (x.id === id || x.lat === null || x.lng === null || !(at <= until) || at <= bestAt) continue
    best = x
    bestAt = at
  }
  return best ? { lat: best.lat, lng: best.lng, name: best.place, source: 'manual' } : null
}
