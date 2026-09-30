import SightingPhoto from '../../ui/SightingPhoto'
import { dayOf } from '../../ui/when'
import type { Sighting } from '../../types'
import { groupByMonth } from './journalList'

interface Props {
  /** 보일 기록 — 이미 거르고 최신순으로 늘어놓은 것 (journalList.ts shownRecords·sortNewest) */
  shown: Sighting[]
  /** 기록 상세로 */
  onOpen: (id: string) => void
}

/**
 * 일지의 기록 목록 — 달 제목 아래 기록 칸(사진·이름·학명·날짜와 장소)의 격자. 누르면 그 기록의 상세로 간다.
 * 보일 기록이 없으면 아무것도 그리지 않는다 ("맞는 기록이 없습니다"는 검색어를 아는 RecordsScreen이 띄운다).
 */
export default function RecordList({ shown, onOpen }: Props) {
  return (
    <>
      {groupByMonth(shown).map(([month, list]) => (
        <section key={month}>
          <h2 className="group-title">{month}</h2>
          <div className="record-grid">
            {list.map((s) => (
              <button key={s.id} type="button" className="record-item card" onClick={() => onOpen(s.id)}>
                <SightingPhoto id={s.id} kind="thumb" alt={s.speciesKo || '이름 미정'} ratio="3 / 2" sound={s.fromSound} />
                <div className="record-item-text">
                  <strong className="display">{s.speciesKo || '이름 미정'}</strong>
                  {s.latin && <em>{s.latin}</em>}
                  <span>{[dayOf(s), s.place].filter(Boolean).join(' · ')}</span>
                </div>
              </button>
            ))}
          </div>
        </section>
      ))}
    </>
  )
}
