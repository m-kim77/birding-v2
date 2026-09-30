/**
 * 일지를 어떻게 보고 있나 — 검색어·"이름 미정" 칩·기간·장소 (순수 계산).
 * 기록을 열었다 돌아와도 고른 것이 남도록 화면 밖(useJournalView)에서 기억하는데, 그러면 고른 것이 **사라진 뒤에도** 남을 수 있다
 * (고른 장소의 마지막 기록을 지움, 마지막 이름 미정 기록에 이름을 붙임, 드라이브에서 바뀐 기록을 받음).
 * 그때 풀 버튼도 없는 빈 목록에 갇히지 않게 `keepValid`가 사라진 선택을 전체로 되돌린다.
 */

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
