/**
 * 일지를 어떻게 보고 있나 — 검색어·"이름 미정" 칩·기간·장소 (순수 계산).
 * 기록을 열었다 돌아와도 고른 것이 남도록 화면 밖(useJournalView)에서 기억하는데, 그러면 고른 것이 **사라진 뒤에도** 남을 수 있다
 * (고른 장소의 마지막 기록을 지움, 마지막 이름 미정 기록에 이름을 붙임, 드라이브에서 바뀐 기록을 받음).
 * 그때 풀 버튼도 없는 빈 목록에 갇히지 않게 `keepValid`가 사라진 선택을 전체로 되돌린다.
 *
 * 기간은 **촬영지 시각**의 해·달(ui/when.ts yearMonthOf — 일지의 달 제목과 같은 기준), 장소는 **저장된 장소 이름 그대로**다.
 * 이름이 빈 기록의 장소를 찾아 채우지 않는다 — 여러 기록의 장소 이름을 한꺼번에 묻는 것은 막혀 있다 (CLAUDE.md, Nominatim).
 * 기록(Sighting)에 칸을 더하지 않고 볼 때만 계산한다.
 */
// 확장자를 적는 이유: node --test가 이 파일을 직접 읽는다 (Vite는 어느 쪽이든 된다)
import { yearMonthOf } from '../../ui/when.ts'
import type { Sighting } from '../../types'
import { shownRecords } from './journalList.ts'

/** 일지를 보는 방식. 기록(Sighting)에는 저장하지 않는다 — 이번 실행 동안만 기억한다 */
export interface JournalView {
  /** 검색 칸의 글자 그대로 (거를 때 앞뒤 빈칸은 matchesQuery가 뺀다) */
  query: string
  /** "이름 미정 N건" 칩이 켜져 있나 */
  onlyUnnamed: boolean
  /** '' = 전체 기간, '2026' = 그 해, '2026-09' = 그 달 (촬영지 시각) */
  period: string
  /** null = 모든 장소. 그 밖은 앞뒤 빈칸을 뺀 장소 이름 — '' 는 장소 이름이 없는 기록 */
  place: string | null
}

/** 아무것도 거르지 않는 처음 값 */
export const ALL_VIEW: JournalView = { query: '', onlyUnnamed: false, period: '', place: null }

/** 고르개의 선택지 하나 */
export interface ViewOption {
  /** 고른 값 — 기간은 '2026'·'2026-09', 장소는 앞뒤 빈칸을 뺀 장소 이름('' = 장소 이름 없음) */
  value: string
  /** 고르개에 보이는 글 ('2026년 9월 · 12건') */
  label: string
}

/** 지금 기록으로 고를 수 있는 것 — keepValid가 고른 것이 아직 있는지 견주는 기준 */
export interface ViewChoices {
  /** 이름 미정 기록 수 (0이면 칩이 없다) */
  unnamed: number
  /** 기간 고르개의 선택지 ("전체 기간"은 빼고) */
  periods: ViewOption[]
  /** 장소 고르개의 선택지 ("모든 장소"는 빼고) */
  places: ViewOption[]
}

/**
 * 고르개가 보이는 선택지인가. 고를 것이 둘 이상일 때만 고르개를 그린다 — 하나뿐이면 눌러도 달라지는 것이 없다.
 * 보이지 않는 고르개가 목록을 거르면 풀 길이 없으므로, 고른 값도 이 기준으로 살아 있는지 본다.
 */
export function pickable(options: ViewOption[], value: string): boolean {
  return options.length >= 2 && options.some((o) => o.value === value)
}

/**
 * 고른 것 가운데 지금 기록에 없는 것을 전체로 되돌린 값. 이름 미정 기록이 0이면 칩을 끄고,
 * 고른 기간·장소가 선택지에 없거나 그 고르개가 안 보이면(선택지가 둘 미만) 전체로. 검색어는 그대로 둔다 (검색 칸에 보이므로 사용자가 지운다).
 * 바뀐 것이 없으면 **같은 객체**를 돌려준다 — 화면이 "바뀌었나"를 === 로 본다.
 */
export function keepValid(view: JournalView, choices: ViewChoices): JournalView {
  const onlyUnnamed = view.onlyUnnamed && choices.unnamed > 0
  const period = view.period === '' || pickable(choices.periods, view.period) ? view.period : ''
  const place = view.place === null || pickable(choices.places, view.place) ? view.place : null
  if (onlyUnnamed === view.onlyUnnamed && period === view.period && place === view.place) return view
  return { ...view, onlyUnnamed, period, place }
}

/** 기간이나 장소를 골랐나 — 골랐으면 화면이 "거른 결과" 줄과 푸는 버튼을 띄운다 (검색어·이름 미정 칩은 제 칸에 보이므로 넣지 않는다) */
export function isNarrowed(view: JournalView): boolean {
  return view.period !== '' || view.place !== null
}

/**
 * 달 숫자를 두 자리 글자로 (9 → '09') — 기간 값 '2026-09'의 달 자리. ui/when.ts의 같은 이름 함수(내보내지 않는다)와 같은 일이다.
 * 두 자리가 넘는 수는 그대로 둔다 (달은 늘 1~12라 생기지 않는다).
 */
const pad2 = (n: number) => String(n).padStart(2, '0')

/** 기록의 달 값 '2026-09' (촬영지 시각). 시각을 못 읽으면 null — 그런 기록은 어느 기간에도 들지 않고 "전체 기간"에서만 보인다 */
export function periodKey(s: Pick<Sighting, 'capturedAt' | 'capturedAtOffset'>): string | null {
  const ym = yearMonthOf(s)
  return ym ? `${ym.year}-${pad2(ym.month)}` : null
}

/** 기간 안의 기록인가. '' = 전부, '2026' = 그 해, '2026-09' = 그 달. 시각을 못 읽는 기록은 '' 에서만 true */
export function inPeriod(s: Pick<Sighting, 'capturedAt' | 'capturedAtOffset'>, period: string): boolean {
  if (!period) return true
  const ym = yearMonthOf(s)
  if (!ym) return false
  return period.includes('-') ? periodKey(s) === period : String(ym.year) === period
}

/** 장소 고르개가 묶는 값 — 앞뒤 빈칸을 뺀 장소 이름. 옛 백업처럼 장소 칸이 없으면 '' (장소 이름 없음) */
function placeKey(s: Pick<Sighting, 'place'>): string {
  return (s.place ?? '').trim()
}

/** 그 장소의 기록인가. null = 전부, '' = 장소 이름이 없는 기록만 */
export function inPlace(s: Pick<Sighting, 'place'>, place: string | null): boolean {
  return place === null || placeKey(s) === place
}

/**
 * 일지에 보일 기록 — 검색어·이름 미정 칩(journalList.ts shownRecords)에 기간·장소까지 건다. 입력의 순서를 그대로 둔다.
 * 맞는 것이 없으면 빈 배열.
 */
export function filterJournal(list: Sighting[], view: JournalView): Sighting[] {
  return shownRecords(list, view.query, view.onlyUnnamed).filter((s) => inPeriod(s, view.period) && inPlace(s, view.place))
}

/**
 * 기간 고르개의 선택지 ("전체 기간" 다음에 올 것). 기록이 있는 달만, 최신 달부터 '2026년 9월 · 12건'.
 * 기록이 두 해 이상에 걸치면 해마다 그 달들 앞에 '2026년 전체 · 34건'을 둔다 (한 해뿐이면 "전체 기간"과 같은 말이라 뺀다).
 * 시각을 못 읽는 기록은 세지 않는다. 기록이 없으면 빈 배열. 건수는 다른 고르개·검색어와 상관없이 모든 기록으로 센다.
 */
export function periodOptions(list: Sighting[]): ViewOption[] {
  const months = new Map<string, { year: number; month: number; count: number }>()
  const years = new Map<number, number>()
  for (const s of list) {
    const ym = yearMonthOf(s)
    if (!ym) continue
    const key = `${ym.year}-${pad2(ym.month)}`
    months.set(key, { ...ym, count: (months.get(key)?.count ?? 0) + 1 })
    years.set(ym.year, (years.get(ym.year) ?? 0) + 1)
  }
  const out: ViewOption[] = []
  let lastYear: number | null = null
  const newest = [...months.entries()].sort(([, a], [, b]) => b.year - a.year || b.month - a.month)
  for (const [key, m] of newest) {
    if (years.size >= 2 && m.year !== lastYear) out.push({ value: String(m.year), label: `${m.year}년 전체 · ${years.get(m.year)}건` })
    lastYear = m.year
    out.push({ value: key, label: `${m.year}년 ${m.month}월 · ${m.count}건` })
  }
  return out
}

/**
 * 장소 고르개의 선택지 ("모든 장소" 다음에 올 것). 기록이 많은 장소부터 '가상 습지 · 20건', 같으면 글자 순.
 * 장소 이름이 빈 기록이 있으면 맨 끝에 '장소 이름 없음 · N건'. 앞뒤 빈칸만 다른 이름은 한 장소다.
 * 글자 순은 localeCompare를 쓰지 않는다 — 기기마다 언어 설정에 따라 순서가 달라진다. 기록이 없으면 빈 배열.
 * 위치를 숨긴 기록(sensitive)의 장소도 나온다 — 일지 목록에는 원래 장소가 보인다 (숨기는 곳은 카드와 지도뿐).
 */
export function placeOptions(list: Sighting[]): ViewOption[] {
  const counts = new Map<string, number>()
  for (const s of list) counts.set(placeKey(s), (counts.get(placeKey(s)) ?? 0) + 1)
  return [...counts.entries()]
    .sort(([a, n], [b, m]) => Number(a === '') - Number(b === '') || m - n || (a < b ? -1 : a > b ? 1 : 0))
    .map(([value, n]) => ({ value, label: `${value || '장소 이름 없음'} · ${n}건` }))
}
