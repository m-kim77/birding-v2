/**
 * 한 번의 탐조(outing) 묶기 — 같은 날 가까운 곳에서 찍은 기록을 한 묶음으로 모은다 (작업 37). 일지가 묶음 위에 머리줄(outingHeadText)을 얹는다.
 *
 * **저장하지 않고 볼 때 모든 기록으로 계산한다** (도감 번호 dex/dexNo.ts와 같은 생각). 묶음에 id를 매겨 저장하면
 * 폰과 PC가 같은 탐조에 서로 다른 id를 줘서, 드라이브·백업으로 합칠 때 한 탐조가 둘로 갈린다.
 * 계산은 기록만 같으면 어느 기기·어느 읽는 순서에서도 같은 답이다. 그래서 새 저장소·기록의 새 칸·DB 판 올리기가 없고,
 * 백업·드라이브 동기화는 이 파일을 모른다. 대가: 묶음에 이름·메모를 붙이거나 손으로 합치고 나눌 수 없다.
 *
 * **이동 기록(구글 타임라인, data/tracks.ts)은 쓰지 않는다.** 이동 기록은 기기에만 있고 백업·드라이브에 없어서,
 * 묶는 데 쓰면 기기마다 묶음과 숫자가 달라진다. 기록의 촬영 시각과 좌표만 본다.
 *
 * 규칙: 촬영 순간 순으로 줄 세워(같은 순간은 id 글자 순) 앞에서부터 본다. **촬영지 날짜**가 바뀌거나, 이 기록에 좌표가 있고
 * 지금 묶음에서 마지막으로 좌표가 있던 기록과 `SAME_OUTING_M` 넘게 떨어졌으면 새 묶음이다. 좌표 없는 기록은 같은 날의 지금 묶음에 붙는다.
 * 자정을 넘긴 탐조는 촬영지 날짜에서 둘로 나뉜다 — 규칙을 "같은 날 가까운 곳" 한 줄로 두려고 받아들였다.
 * 시간대를 모르는 기록(`capturedAtOffset`이 null)은 날짜를 브라우저 시간대로 풀어서, 시간대가 다른 기기에서는 묶음이 다를 수 있다 (일지의 달 제목도 같다).
 */
// 확장자를 적는 이유: node --test가 이 파일을 직접 읽는다 (Vite는 어느 쪽이든 된다)
import { distanceM } from '../../lib/tracklog/match.ts'
import { instantOf } from '../../lib/timeOrder.ts'
import { dayOf, fileDateOf, timeOf } from '../../ui/when.ts'
import type { Sighting } from '../../types'

/**
 * 연달아 찍은 두 기록(좌표가 있는 것끼리)이 이만큼(m) 넘게 떨어지면 다른 탐조로 본다. 묶음 전체의 반경이 아니다 —
 * 하천을 따라 걸으며 찍으면 처음과 끝이 멀어도 한 묶음이다. 걷는 탐조는 거의 늘 이 안이고, 차로 옮겨 간 다른 탐조지는 대개 넘는다.
 * 실제 기록을 보고 고칠 값이다. 저장하지 않으므로 바꾸면 그 자리에서 다시 묶인다.
 */
export const SAME_OUTING_M = 3000

/** 한 번의 탐조. 볼 때마다 새로 계산한다 — 저장하지 않는다 */
export interface Outing {
  /** 가장 이른 기록의 id. React key로만 쓴다 — 기록을 고치거나 지우면 달라질 수 있어 어디에도 저장하지 않는다 */
  key: string
  /** 촬영지 날짜 'YYYY-MM-DD'. 시각을 못 읽는 기록의 한 건짜리 묶음은 '' */
  date: string
  /** 장소 이름이 있는 가장 이른 기록의 장소(앞뒤 빈칸 뺌). 다 비었으면 '' — 장소 이름을 새로 찾지 않는다 (CLAUDE.md, Nominatim) */
  place: string
  /** 이름 붙은 종, 처음 찍힌 순, 겹치지 않게. 이름 미정 기록은 들지 않는다 */
  species: string[]
  /** 이 탐조의 기록 — 찍은 순 (같은 순간은 id 글자 순). 늘 한 건 이상 */
  items: Sighting[]
}

/**
 * 촬영 순간의 옛것부터, 같은 순간이면 id 글자 순. 입력 순서와 상관없이 늘 같은 줄이 나온다.
 * id는 localeCompare로 견주지 않는다 — 기기의 언어 설정에 따라 순서가 달라진다.
 */
function byTimeThenId(a: Sighting, b: Sighting): number {
  const x = instantOf(a.capturedAt)
  const y = instantOf(b.capturedAt)
  if (x !== y) return x < y ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/** 좌표가 있으면 [위도, 경도], 없으면 null. 옛 백업처럼 칸이 없거나 숫자가 아니어도 null — 위치 없는 기록으로 친다 */
function pointOf(s: Sighting): [number, number] | null {
  return Number.isFinite(s.lat) && Number.isFinite(s.lng) ? [s.lat as number, s.lng as number] : null
}

/**
 * 줄 세운 기록(시각을 읽을 수 있는 것만)을 묶음마다의 기록 배열로 나눈다 — 머리말의 규칙.
 * 거리는 `lib/tracklog/match.ts distanceM`(하버사인)을 그대로 부른다 — 이동 기록의 점은 읽지 않고, 기록의 좌표 둘 사이만 잰다.
 * 묶음의 첫 기록에 좌표가 없으면 다음에 좌표가 있는 기록이 견줄 기준이 된다. 빈 입력이면 빈 배열.
 */
function chain(sorted: Sighting[]): Sighting[][] {
  const groups: Sighting[][] = []
  let date = ''
  let lastPoint: [number, number] | null = null
  for (const s of sorted) {
    const day = fileDateOf(s)
    const p = pointOf(s)
    const far = p !== null && lastPoint !== null && distanceM(lastPoint[0], lastPoint[1], p[0], p[1]) > SAME_OUTING_M
    if (groups.length === 0 || day !== date || far) {
      groups.push([])
      date = day
      lastPoint = null
    }
    groups[groups.length - 1].push(s)
    if (p) lastPoint = p
  }
  return groups
}

/** 한 묶음의 기록(찍은 순)으로 Outing을 만든다. `items`는 한 건 이상이어야 한다 */
function summarize(items: Sighting[], date: string): Outing {
  const species: string[] = []
  for (const s of items) if (s.speciesKo && !species.includes(s.speciesKo)) species.push(s.speciesKo)
  // 옛 백업에서 온 기록은 장소 칸이 없을 수 있다
  const place = items.map((s) => (s.place ?? '').trim()).find(Boolean) ?? ''
  return { key: items[0].id, date, place, species, items }
}

/**
 * 모든 기록을 탐조 묶음으로 나눈다 — 옛 탐조부터. 입력 배열은 바꾸지 않는다. 빈 입력이면 빈 배열.
 * 일지에 보일 기록만이 아니라 **모든 기록**을 넘긴다 — 검색·거르기로 몇 건만 보여도 머리줄의 숫자는 그 탐조 전체여야 한다.
 * 시각을 못 읽는 기록은 어느 날의 탐조인지 모르므로 하나씩 따로 둔다 (날짜 '', 맨 뒤에 id 순) — 같은 날의 줄을 끊지도 않는다.
 */
export function outingsOf(sightings: Sighting[]): Outing[] {
  const readable = sightings.filter((s) => instantOf(s.capturedAt) !== -Infinity).sort(byTimeThenId)
  const unreadable = sightings.filter((s) => instantOf(s.capturedAt) === -Infinity).sort(byTimeThenId)
  return [
    ...chain(readable).map((items) => summarize(items, fileDateOf(items[0]))),
    ...unreadable.map((s) => summarize([s], '')),
  ]
}

/** 일지의 탐조 머리줄에 쓰는 글 세 줄 */
export interface OutingHeadText {
  /** '9월 22일 · 가상 습지' — 장소 이름이 없으면 날짜만 */
  title: string
  /** '06:40~09:10 · 14종 · 기록 20건' */
  facts: string
  /** '박새 · 쇠오리 · …' (처음 찍힌 순). 이름 붙은 종이 없으면 '' — 화면이 이 줄을 그리지 않는다 */
  names: string
}

/**
 * 머리줄의 글. 숫자는 묶음 **전체**다 (검색·거르기와 상관없다 — '박새'를 찾았다고 그 탐조가 1종이 되면 틀린 말이다).
 * 시각은 첫 기록~마지막 기록의 촬영지 시각이고, 둘이 같은 분이면 하나만 적는다. 이름 붙은 종이 없으면 종 수를 뺀다 ('0종'은 할 말이 아니다).
 * 시각을 못 읽는 한 건짜리 묶음에는 머리줄이 없어 부를 일이 없지만, 불러도 던지지 않고 날짜·시각을 빼고 적는다 ('NaN월'을 보이지 않게).
 */
export function outingHeadText(o: Outing): OutingHeadText {
  const first = o.items[0]
  const from = timeOf(first)
  const to = timeOf(o.items[o.items.length - 1])
  const time = from === to ? from : `${from}~${to}`
  return {
    title: [o.date ? dayOf(first) : '', o.place].filter(Boolean).join(' · '),
    facts: [time, o.species.length > 0 ? `${o.species.length}종` : '', `기록 ${o.items.length}건`].filter(Boolean).join(' · '),
    names: o.species.join(' · '),
  }
}
