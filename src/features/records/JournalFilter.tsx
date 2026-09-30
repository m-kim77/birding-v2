import Button from '../../ui/Button'
import { isNarrowed, type JournalView, type ViewOption } from './journalView'
import './journal.css'

interface Props {
  /** 지금 보는 방식 (useJournalView — 사라진 선택은 이미 전체로 되돌린 값) */
  view: JournalView
  /** 바꾼 보는 방식을 받는다 */
  onChange: (next: JournalView) => void
  /** 기간 고르개의 선택지 (journalView.ts periodOptions). 둘 미만이면 고르개를 그리지 않는다 */
  periods: ViewOption[]
  /** 장소 고르개의 선택지 (journalView.ts placeOptions). 둘 미만이면 고르개를 그리지 않는다 */
  places: ViewOption[]
  /** 이름 미정 기록 수. 0이면 칩을 그리지 않는다 */
  unnamed: number
  /** 지금 목록에 보이는 기록 수 (거른 결과 줄) */
  shownCount: number
  /** 지금 목록에 보이는 기록의 종 수 — 이름 있는 기록만 센다 (dex/speciesCount.ts) */
  shownSpecies: number
}

/**
 * 장소 고르개의 option 값. "모든 장소"를 ''로 두므로, 장소 이름이 없는 기록('')과 겹치지 않게 장소에는 앞에 'p:'를 붙인다.
 * 장소 이름에 어떤 글자가 들어 있어도 되돌릴 수 있다 (앞 두 글자만 뗀다).
 */
function placeValue(place: string | null): string {
  return place === null ? '' : `p:${place}`
}

/** placeValue를 되돌린다. '' 이면 null(모든 장소) */
function placeFrom(value: string): string | null {
  return value === '' ? null : value.slice(2)
}

/**
 * 일지 검색 칸 아래의 거르기 줄 — 기간 고르개·장소 고르개·"이름 미정" 칩, 그리고 기간·장소를 골랐을 때 "거른 결과" 한 줄.
 * 고르개는 브라우저 기본 고르개(select)다 — 장소는 수십 곳이 될 수 있어 칩으로 늘어놓으면 첫 화면을 덮고, 폰에서는 긴 목록을 고르기 편하다.
 * 고를 것이 둘 이상일 때만 그린다. 그릴 것이 하나도 없으면 아무것도 그리지 않는다.
 * 뒤로가기 겹이 아니다 — 고르개가 닫힌 뒤 뒤로가기는 화면을 떠난다.
 */
export default function JournalFilter({ view, onChange, periods, places, unnamed, shownCount, shownSpecies }: Props) {
  const hasPeriods = periods.length >= 2
  const hasPlaces = places.length >= 2
  return (
    <>
      {(hasPeriods || hasPlaces || unnamed > 0) && (
        <div className="chips">
          {hasPeriods && (
            // 기간 고르개: 검색어로는 날짜를 못 찾는다 — "작년 5월에 뭘 봤지"는 해·달로 골라야 답이 나온다. 기록이 두 달 이상에 걸칠 때만
            <select className={`chip${view.period ? ' is-on' : ''}`} aria-label="기간" value={view.period} onChange={(e) => onChange({ ...view, period: e.target.value })}>
              <option value="">전체 기간</option>
              {periods.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}
          {hasPlaces && (
            // 장소 고르개: 장소 이름을 기억해 치지 않고 다녀온 곳에서 고른다. 장소가 두 곳 이상일 때만
            <select className={`chip${view.place !== null ? ' is-on' : ''}`} aria-label="장소" value={placeValue(view.place)} onChange={(e) => onChange({ ...view, place: placeFrom(e.target.value) })}>
              <option value="">모든 장소</option>
              {places.map((o) => <option key={o.value} value={placeValue(o.value)}>{o.label}</option>)}
            </select>
          )}
          {unnamed > 0 && (
            // 이름 미정 칩: 이름 없이 저장한 기록을 나중에 모아서 채우려면 골라낼 수단이 있어야 한다. 그런 기록이 없으면 칩도 없다
            <button type="button" className={`chip${view.onlyUnnamed ? ' is-on' : ''}`} aria-pressed={view.onlyUnnamed} onClick={() => onChange({ ...view, onlyUnnamed: !view.onlyUnnamed })}>이름 미정 {unnamed}건</button>
          )}
        </div>
      )}
      {isNarrowed(view) && (
        <div className="filter-result">
          <p role="status">거른 결과 기록 {shownCount}건 · {shownSpecies}종</p>
          {/* 전체 보기: 걸러진 목록을 보고 기록이 사라진 줄 알지 않게, 푸는 길이 결과 바로 옆에 있어야 한다 (새 기록을 저장하고 돌아왔는데 작년이 걸려 있을 때도).
              기간·장소만 푼다 — 검색어는 검색 칸에 보이므로 거기서 지운다 */}
          <Button variant="quiet" onClick={() => onChange({ ...view, period: '', place: null })}>전체 보기</Button>
        </div>
      )}
    </>
  )
}
