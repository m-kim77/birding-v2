import { useState } from 'react'
import { useJournal } from '../../data/journal'
import { ScreenHead } from '../../ui/bits'
import Button from '../../ui/Button'
import Sheet from '../../ui/Sheet'
import type { Sighting } from '../../types'
import BirdCard from './BirdCard'
import CardActions from './CardActions'

/**
 * 종마다 가장 등급이 높은 기록 하나를 대표 카드로 고른다. 이름 없는 기록은 도감에 넣지 않는다.
 */
function representativeCards(sightings: Sighting[]): Sighting[] {
  const best = new Map<string, Sighting>()
  for (const s of sightings) {
    if (!s.speciesKo) continue
    const cur = best.get(s.speciesKo)
    if (!cur || s.tier > cur.tier) best.set(s.speciesKo, s)
  }
  return [...best.values()]
}

/**
 * 내 새 도감 — 모은 카드를 종별로 본다.
 * 못 본 종의 빈 칸은 그리지 않는다. 채우라고 압박하면 희귀종을 쫓게 되고, 그건 새에게 해롭다.
 */
export default function DexScreen({ onOpenRecord }: { onOpenRecord: (id: string) => void }) {
  const { sightings } = useJournal()
  const cards = representativeCards(sightings ?? [])
  const [open, setOpen] = useState<Sighting | null>(null)

  return (
    <div className="screen">
      <ScreenHead title="내 새 도감" sub={`지금까지 ${cards.length}종을 만났습니다`} />
      {cards.length === 0 && <p className="hint">이름이 정해진 기록이 생기면 여기에 카드가 모입니다.</p>}
      <div className="dex-grid">
        {cards.map((s) => (
          <button key={s.id} type="button" className="dex-cell" onClick={() => setOpen(s)} aria-label={`${s.speciesKo} 카드 크게 보기`}>
            <BirdCard sighting={s} small />
          </button>
        ))}
      </div>
      {open && (
        <Sheet title={open.speciesKo} onClose={() => setOpen(null)}>
          <BirdCard sighting={open} />
          <div className="sheet-actions">
            <CardActions sighting={open} />
            {/* 기록 보기: 카드에는 메모·판정 근거가 없다. 그걸 보려면 기록으로 가야 한다 */}
            <Button variant="quiet" onClick={() => onOpenRecord(open.id)}>이 기록 보기</Button>
          </div>
        </Sheet>
      )}
    </div>
  )
}
