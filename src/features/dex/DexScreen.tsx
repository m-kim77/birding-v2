import { useMemo, useState } from 'react'
import { useJournal } from '../../data/journal'
import { ScreenHead } from '../../ui/bits'
import Icon from '../../ui/Icon'
import Sheet from '../../ui/Sheet'
import { dayOf } from '../../ui/when'
import type { Sighting } from '../../types'
import BirdCard from './BirdCard'
import CardActions from './CardActions'

interface SpeciesEntry {
  name: string
  /** 대표 카드 — 그 종의 기록 중 등급이 가장 높은 것 (같으면 최근 것) */
  best: Sighting
  /** 그 종의 모든 기록, 최근 것부터 */
  all: Sighting[]
}

/** 기록을 종별로 묶는다. 이름 없는 기록은 도감에 넣지 않는다. 도감 번호 순으로 늘어놓는다 */
function bySpecies(sightings: Sighting[]): SpeciesEntry[] {
  const groups = new Map<string, Sighting[]>()
  for (const s of sightings) if (s.speciesKo) groups.set(s.speciesKo, [...(groups.get(s.speciesKo) ?? []), s])
  return [...groups.entries()].map(([name, list]) => {
    const all = [...list].sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))
    return { name, all, best: all.reduce((top, s) => (s.tier > top.tier ? s : top), all[0]) }
  }).sort((a, b) => (a.best.dexNo ?? 9999) - (b.best.dexNo ?? 9999))
}

/**
 * 내 새 도감 — **종별로** 본다. 일지가 "언제 무엇을 봤나"라면 도감은 "지금까지 어떤 새를 만났나"다.
 * 한 칸이 한 종이고, 누르면 그 종의 대표 카드와 그 종을 만난 모든 기록이 나온다.
 * 못 본 종의 빈 칸은 그리지 않는다. 채우라고 압박하면 희귀종을 쫓게 되고, 그건 새에게 해롭다.
 */
export default function DexScreen({ onOpenRecord }: { onOpenRecord: (id: string) => void }) {
  const { sightings } = useJournal()
  const species = useMemo(() => bySpecies(sightings ?? []), [sightings])
  const [openName, setOpenName] = useState('')
  const open = species.find((e) => e.name === openName) ?? null

  return (
    <div className="screen">
      <ScreenHead title="도감" sub={`종별 · 지금까지 ${species.length}종을 만났습니다`} />
      {species.length === 0 && <p className="hint">이름이 정해진 기록이 생기면 여기에 종마다 카드가 한 장씩 모입니다.</p>}
      <div className="dex-grid">
        {species.map((e) => (
          <button key={e.name} type="button" className="dex-cell" onClick={() => setOpenName(e.name)} aria-label={`${e.name}, 기록 ${e.all.length}건`}>
            <BirdCard sighting={e.best} small />
            {e.all.length > 1 && <span className="dex-count">{e.all.length}번 만남</span>}
          </button>
        ))}
      </div>
      {open && (
        <Sheet title={open.name} onClose={() => setOpenName('')}>
          <BirdCard sighting={open.best} />
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
      )}
    </div>
  )
}
