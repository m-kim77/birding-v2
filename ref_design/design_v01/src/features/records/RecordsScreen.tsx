import { useMemo, useState } from 'react'
import { useStore } from '../../app/store'
import { Banner, ScreenHead, Tag } from '../../ui/bits'
import Button from '../../ui/Button'
import Icon from '../../ui/Icon'
import PhotoBox from '../../ui/PhotoBox'
import { formatDay, formatMonth } from '../../ui/format'
import type { Sighting } from '../../types'

/** 검색어가 종 이름·학명·장소 중 어디든 들어 있으면 남긴다. 빈 검색어는 전부 통과 */
function matches(s: Sighting, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [s.speciesKo, s.latin, s.place].some((v) => v.toLowerCase().includes(q))
}

/** 달별로 묶는다. 입력이 최신순이면 결과도 최신 달부터 나온다 */
function groupByMonth(list: Sighting[]): Array<[string, Sighting[]]> {
  const groups = new Map<string, Sighting[]>()
  for (const s of list) {
    const key = formatMonth(s.capturedAt)
    groups.set(key, [...(groups.get(key) ?? []), s])
  }
  return [...groups.entries()]
}

/** 기록 한 줄의 상태 꼬리표. 판정이 끝난 평범한 기록에는 아무것도 붙이지 않는다 */
function StatusTag({ s }: { s: Sighting }) {
  if (s.identify === 'waiting' || s.identify === 'running') return <Tag tone="accent">판정 대기</Tag>
  if (s.identify === 'server-down') return <Tag tone="warn">판정 보류</Tag>
  return null
}

interface Props {
  onOpen: (id: string) => void
  onBackup: () => void
  onAdd: () => void
}

/**
 * 첫 화면이자 기록 목록. 홈 화면을 따로 두지 않고 요약을 목록 맨 위에 얹었다.
 * 검색은 하나만 둔다 — 필터·정렬 버튼은 기록이 수백 건이 되어 실제로 필요해질 때 더한다.
 */
export default function RecordsScreen({ onOpen, onBackup, onAdd }: Props) {
  const { sightings, unsaved } = useStore()
  const [query, setQuery] = useState('')
  const sorted = useMemo(() => [...sightings].sort((a, b) => b.capturedAt.localeCompare(a.capturedAt)), [sightings])
  const shown = sorted.filter((s) => matches(s, query))
  const speciesCount = new Set(sightings.filter((s) => s.speciesKo).map((s) => s.speciesKo)).size

  if (sightings.length === 0) {
    return (
      <div className="screen screen-empty">
        <Icon name="bird" size={56} />
        <h1>첫 기록을 남겨 보세요</h1>
        <p>사진이나 녹음 하나면 됩니다. 시각과 위치는 자동으로 채워집니다.</p>
        <Button variant="primary" icon="plus" onClick={onAdd}>새 기록</Button>
      </div>
    )
  }

  return (
    <div className="screen">
      <ScreenHead title="탐조일지" sub={`기록 ${sightings.length}건 · ${speciesCount}종`} />
      {unsaved > 0 && (
        // 기록이 이 기기에만 있으므로, 백업 안 된 기록 수는 늘 보여야 한다. 누르면 바로 백업으로 간다
        <Banner tone="warn" icon="download" action={<Button variant="quiet" onClick={onBackup}>백업하기</Button>}>
          마지막 백업 이후 기록 {unsaved}건이 이 기기에만 있습니다
        </Banner>
      )}
      <label className="search">
        <Icon name="search" size={18} />
        <input type="search" placeholder="새 이름이나 장소로 찾기" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      {shown.length === 0 && <p className="hint">"{query}"에 맞는 기록이 없습니다.</p>}
      {groupByMonth(shown).map(([month, list]) => (
        <section key={month}>
          <h2 className="group-title">{month}</h2>
          <div className="record-grid">
            {list.map((s) => (
              <button key={s.id} type="button" className="record-item card" onClick={() => onOpen(s.id)}>
                <PhotoBox src={s.photo} alt={s.speciesKo || '이름 미정'} sound={s.fromSound} />
                <div className="record-item-text">
                  <div className="record-item-name">
                    <strong className="display">{s.speciesKo || '이름 미정'}</strong>
                    <StatusTag s={s} />
                  </div>
                  {s.latin && <em>{s.latin}</em>}
                  <span>{formatDay(s.capturedAt)} · {s.place}</span>
                </div>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
