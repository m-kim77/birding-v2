import SightingPhoto from '../../ui/SightingPhoto'
import { dayOf } from '../../ui/when'
import type { Sighting } from '../../types'
import type { MonthSection } from './journalList'
import { outingHeadText, type Outing } from './outings'

interface Props {
  /** 보일 기록을 달별·탐조 묶음별로 나눈 것 (journalList.ts monthSections — 이미 거르고 최신순으로 늘어놓은 기록으로 만든다) */
  sections: MonthSection[]
  /** 기록 상세로 */
  onOpen: (id: string) => void
}

/**
 * 탐조 묶음(기록 두 건 이상) 위의 머리줄 — 날짜·장소, 첫~마지막 시각·종 수·기록 수, 종 이름들 (outings.ts outingHeadText).
 * 숫자는 묶음 전체라 검색 중에도 그대로다. 누르는 것이 아니다 — 종 이름은 셋째 줄로 이미 보이고,
 * 버튼으로 만들면 존재 이유(BUTTONS.md)와 시트의 뒤로가기 겹이 더 든다. 종 이름이 없으면 셋째 줄을 그리지 않는다.
 */
function OutingHead({ outing }: { outing: Outing }) {
  const text = outingHeadText(outing)
  return (
    <div className="outing-head">
      <h3>{text.title}</h3>
      <p>{text.facts}</p>
      {text.names && <p className="outing-species">{text.names}</p>}
    </div>
  )
}

/** 기록 칸 하나 — 사진·이름·학명·날짜와 장소. 누르면 그 기록의 상세로 간다 */
function RecordItem({ s, onOpen }: { s: Sighting; onOpen: (id: string) => void }) {
  return (
    <button type="button" className="record-item card" onClick={() => onOpen(s.id)}>
      <SightingPhoto id={s.id} kind="thumb" alt={s.speciesKo || '이름 미정'} ratio="3 / 2" sound={s.fromSound} />
      <div className="record-item-text">
        <strong className="display">{s.speciesKo || '이름 미정'}</strong>
        {s.latin && <em>{s.latin}</em>}
        <span>{[dayOf(s), s.place].filter(Boolean).join(' · ')}</span>
      </div>
    </button>
  )
}

/**
 * 일지의 기록 목록 — 달 제목 아래 덩어리마다 [탐조 머리줄] + 기록 칸의 격자. 누르면 그 기록의 상세로 간다.
 * 한 건짜리 묶음의 이어진 기록은 머리줄 없는 격자 하나로 모인다 (PC 너비에서 카드가 한 줄에 하나씩 놓이지 않게).
 * 보일 기록이 없으면 아무것도 그리지 않는다 ("맞는 기록이 없습니다"는 검색어를 아는 RecordsScreen이 띄운다).
 */
export default function RecordList({ sections, onOpen }: Props) {
  return (
    <>
      {sections.map(({ month, blocks }) => (
        <section key={month}>
          <h2 className="group-title">{month}</h2>
          {blocks.map((b) => (
            // 덩어리의 key는 첫 기록의 id — 한 기록은 목록에 한 번만 나오므로 겹치지 않는다 (묶음 key는 같은 머리줄이 두 번 나오는 드문 경우에 겹친다)
            <div key={b.items[0].id} className="record-block">
              {b.outing && <OutingHead outing={b.outing} />}
              <div className="record-grid">
                {b.items.map((s) => <RecordItem key={s.id} s={s} onOpen={onOpen} />)}
              </div>
            </div>
          ))}
        </section>
      ))}
    </>
  )
}
