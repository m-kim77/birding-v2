import { useMemo, useState } from 'react'
import { useJournal } from '../../data/journal'
import { ScreenHead } from '../../ui/bits'
import Icon from '../../ui/Icon'
import Sheet from '../../ui/Sheet'
import { dayOf } from '../../ui/when'
import BirdCard from './BirdCard'
import { bySpecies, type SpeciesEntry } from './bySpecies'
import { speciesInYear } from './speciesCount'
import CardActions from './CardActions'
import CardStylePicker from './CardStylePicker'
import SyncBanner from './SyncBanner'
import { useDexNumbers } from './useDexNo'
import { useYearChip } from './useYearChip'

interface SheetProps {
  /** 연 종 */
  open: SpeciesEntry
  onClose: () => void
  /** 기록 상세로 */
  onOpenRecord: (id: string) => void
}

/** 한 종의 시트 — 대표 카드와 카드 색·저장·공유, 그 종을 만난 모든 기록 (누르면 그 기록의 상세로) */
function SpeciesSheet({ open, onClose, onOpenRecord }: SheetProps) {
  return (
    <Sheet title={open.name} onClose={onClose}>
      <BirdCard sighting={open.best} />
      {/* 도감에서 고른 색은 그 종의 모든 기록에 준다 — 대표 카드는 새 기록이 오면 바뀌므로, 한 건만 바꾸면 고른 색이 사라진다 */}
      <CardStylePicker sighting={open.best} alsoIds={open.all.filter((s) => s.id !== open.best.id).map((s) => s.id)} />
      <CardActions sighting={open.best} />
      <section className="dex-history">
        <h3>이 새를 만난 기록 {open.all.length}건</h3>
        <ul>
          {open.all.map((s) => (
            <li key={s.id}><button type="button" onClick={() => onOpenRecord(s.id)}>
              <span>{dayOf(s)}</span><span>{s.place}</span><Icon name="chevron" size={16} />
            </button></li>
          ))}
        </ul>
      </section>
    </Sheet>
  )
}

/**
 * 내 새 도감 — **종별로** 본다. 일지가 "언제 무엇을 봤나"라면 도감은 "지금까지 어떤 새를 만났나"다.
 * 한 칸이 한 종이고, 누르면 그 종의 대표 카드와 그 종을 만난 모든 기록이 나온다.
 * 못 본 종의 빈 칸은 그리지 않는다. 채우라고 압박하면 희귀종을 쫓게 되고, 그건 새에게 해롭다.
 * "올해 K종" 칩은 올해(촬영지 시각의 해) 만난 종만 남긴다 — 카드의 No.는 그대로다 (모든 기록으로 매긴 번호).
 */
export default function DexScreen({ onOpenRecord }: { onOpenRecord: (id: string) => void }) {
  const { sightings } = useJournal()
  const numbers = useDexNumbers()
  // 묶기와 번호에는 늘 모든 기록을 넘기고, 올해 칩은 묶은 뒤의 종 목록만 거른다 — 걸러진 기록으로 번호를 매기면 카드의 No.가 바뀐다
  const species = useMemo(() => bySpecies(sightings ?? [], numbers), [sightings, numbers])
  // 해는 그릴 때마다 읽어 memo의 기준에 넣는다 — 기록에만 매이면 앱을 연 채 해가 바뀔 때 도감만 전해로 남아 일지의 "올해 K종"과 달라진다
  const year = new Date().getFullYear()
  const thisYear = useMemo(() => speciesInYear(sightings ?? [], year), [sightings, year])
  // 올해 종이 0이거나 전부면 칩이 없다 (눌러도 달라지지 않거나 빈 도감이 된다). 칩이 안 보이면 거르지도 않는다 — 풀 길 없는 거르기가 남지 않게
  const yearChip = thisYear.size > 0 && thisYear.size < species.length
  // 켜 둔 칩은 기록을 열었다 돌아와도 남는다 (useYearChip — 이번 실행 동안만). 기록을 읽는 중에는 칩이 안 보여도 기억을 끄지 않는다
  const [onlyThisYear, toggleThisYear] = useYearChip(sightings ? yearChip : null)
  const shown = yearChip && onlyThisYear ? species.filter((e) => thisYear.has(e.name)) : species
  const [openName, setOpenName] = useState('')
  const open = species.find((e) => e.name === openName) ?? null

  return (
    <div className="screen">
      <ScreenHead title="도감" sub={`종별 · 지금까지 ${species.length}종을 만났습니다`} />
      <SyncBanner />
      {yearChip && (
        // 올해 칩: 도감은 지금까지의 종을 다 보여 준다 — 올해 만난 종(올해 목록)만 보려면 골라낼 수단이 있어야 한다. 숫자만 보이고 목표·작년 비교는 붙이지 않는다
        <div className="chips">
          <button type="button" className={`chip${onlyThisYear ? ' is-on' : ''}`} aria-pressed={onlyThisYear} onClick={toggleThisYear}>올해 {thisYear.size}종</button>
        </div>
      )}
      {species.length === 0 && <p className="hint">이름이 정해진 기록이 생기면 여기에 종마다 카드가 한 장씩 모입니다.</p>}
      <div className="dex-grid">
        {shown.map((e) => (
          <button key={e.name} type="button" className="dex-cell" onClick={() => setOpenName(e.name)} aria-label={`${e.name}, 기록 ${e.all.length}건`}>
            <BirdCard sighting={e.best} small />
            {e.all.length > 1 && <span className="dex-count">{e.all.length}번 만남</span>}
          </button>
        ))}
      </div>
      {open && <SpeciesSheet open={open} onClose={() => setOpenName('')} onOpenRecord={onOpenRecord} />}
    </div>
  )
}
