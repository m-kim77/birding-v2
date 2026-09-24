import { useMemo, useState } from 'react'
import { isTouchDevice } from '../../app/device'
import InstallHint from '../../app/InstallHint'
import { BACKUP_NUDGE_AT, useJournal } from '../../data/journal'
import { dismissTrackNudge, loadTrackNudgeDismissed, needsTrackRefresh } from '../tracks/refreshNudge'
import { useTracksMeta } from '../tracks/useTracksMeta'
import { Banner, ScreenHead } from '../../ui/bits'
import Button from '../../ui/Button'
import Icon from '../../ui/Icon'
import SightingPhoto from '../../ui/SightingPhoto'
import { dayOf, monthOf } from '../../ui/when'
import type { Sighting } from '../../types'

/**
 * 검색어가 종 이름·학명·장소·메모 중 어디든 들어 있으면 남긴다. 빈 검색어는 전부 통과 (메모는 개체 수·행동을 적으라고 만든 칸이라 같이 찾는다).
 * 옛 백업에서 온 기록은 키가 비어 있을 수 있어 `?? ''`로 받는다 — 검색하다 화면이 죽으면 안 된다.
 */
function matches(s: Sighting, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [s.speciesKo, s.latin, s.place, s.note].some((v) => (v ?? '').toLowerCase().includes(q))
}

/** 달별로 묶는다. 입력이 최신순이면 결과도 최신 달부터 나온다 */
function groupByMonth(list: Sighting[]): Array<[string, Sighting[]]> {
  const groups = new Map<string, Sighting[]>()
  for (const s of list) {
    const key = monthOf(s)
    groups.set(key, [...(groups.get(key) ?? []), s])
  }
  return [...groups.entries()]
}

/**
 * 백업 알림을 띄우는 기준 건수. 브라우저가 저장소 보존을 거절한 **폰**에서는 1건부터 — 폰은 저장 공간이 자주 모자라고, 모자라면 이 앱의 자료부터 지워진다.
 * PC에서는 거절돼도 5건 기준을 지킨다 (PC 브라우저가 저장소를 지우는 일은 드물어서, 매번 띄우면 알림에 무뎌진다).
 */
function nudgeAt(persisted: boolean | null): number {
  return persisted === false && isTouchDevice() ? 1 : BACKUP_NUDGE_AT
}

interface Props {
  onOpen: (id: string) => void
  onBackup: () => void
  onAdd: () => void
  /** 설정 화면으로 (이동 기록 알림의 "설정으로" — 파일을 넣는 곳이 설정의 이동 기록 카드다) */
  onSettings: () => void
}

/**
 * 첫 화면이자 기록 목록. 홈 화면을 따로 두지 않고 요약을 목록 맨 위에 얹었다.
 * 검색은 하나만 둔다 — 필터·정렬 버튼은 기록이 수백 건이 되어 실제로 필요해질 때 더한다.
 * 예외는 "이름 미정" 칩 하나: 이름 없이 저장하라고 권하므로, 그 기록을 다시 찾을 길은 있어야 한다.
 */
export default function RecordsScreen({ onOpen, onBackup, onAdd, onSettings }: Props) {
  const journal = useJournal()
  const { unsaved, persisted } = journal
  const sightings = useMemo(() => journal.sightings ?? [], [journal.sightings])
  const [query, setQuery] = useState('')
  const [onlyUnnamed, setOnlyUnnamed] = useState(false)
  // 이동 기록 60일 알림. meta가 undefined(읽는 중)·null(없음)이면 안 그린다 — 넣은 적이 없는 사람에게 "새로 넣으라"고 하면 안 된다
  const trackMeta = useTracksMeta().meta
  const [nudgeDismissed, setNudgeDismissed] = useState(loadTrackNudgeDismissed)
  const closeTrackNudge = (importedAt: string) => { dismissTrackNudge(importedAt); setNudgeDismissed(importedAt) }
  const sorted = useMemo(() => [...sightings].sort((a, b) => b.capturedAt.localeCompare(a.capturedAt)), [sightings])
  const unnamed = sightings.filter((s) => !s.speciesKo).length
  const shown = sorted.filter((s) => matches(s, query) && (!onlyUnnamed || !s.speciesKo))
  const speciesCount = new Set(sightings.filter((s) => s.speciesKo).map((s) => s.speciesKo)).size

  if (journal.sightings === null) return <div className="screen"><p className="hint">기록을 읽는 중…</p></div>
  if (journal.error) return <div className="screen"><Banner tone="err" icon="alert">{journal.error}</Banner></div>
  if (sightings.length === 0) {
    return (
      <div className="screen screen-empty">
        <Icon name="bird" size={56} />
        <h1>첫 기록을 남겨 보세요</h1>
        <p>사진 한 장이면 됩니다. 사진에 든 시각과 위치는 자동으로 채워지고, 기록과 사진은 이 브라우저에만 저장됩니다.</p>
        <Button variant="primary" icon="plus" onClick={onAdd}>새 기록</Button>
        {/* 백업에서 불러오기: 기기를 바꾼 사람이 설정을 못 찾으면 기록을 되살릴 길이 없다 (설정의 첫 카드가 백업이라 거기로 보낸다) */}
        <Button variant="quiet" icon="upload" onClick={onBackup}>백업 파일에서 불러오기</Button>
        {/* 설치 안내는 기록을 만들기 **전**이 가장 좋다 — 홈 화면 앱은 저장소가 따로라 나중에 옮겨야 한다 */}
        <InstallHint hasRecords={false} onBackup={onBackup} />
      </div>
    )
  }

  return (
    <div className="screen">
      <ScreenHead title="일지" sub={`날짜순 · 기록 ${sightings.length}건 · ${speciesCount}종`} />
      <InstallHint hasRecords onBackup={onBackup} />
      {unsaved >= nudgeAt(persisted) && (
        // 기록이 이 기기에만 있으므로 백업이 밀리면 알려야 한다. 누르면 바로 백업으로 간다
        <Banner tone="warn" icon="download" action={<Button variant="quiet" onClick={onBackup}>백업하기</Button>}>
          마지막 백업 이후 기록 {unsaved}건이 이 기기에만 있습니다
        </Banner>
      )}
      {trackMeta && needsTrackRefresh(trackMeta.importedAt, nudgeDismissed, new Date()) && (
        // 설정으로 · 닫기: 구글은 3개월이 지난 기록을 지운다 — 한 번은 말해야 하고, 들은 뒤엔 치울 수 있어야 한다. 닫은 기억은 이 넣기(importedAt)에만 붙는다
        <Banner tone="info" icon="map" action={
          <div className="row-actions">
            <Button variant="quiet" onClick={onSettings}>설정으로</Button>
            <Button variant="quiet" onClick={() => closeTrackNudge(trackMeta.importedAt)}>닫기</Button>
          </div>
        }>
          이동 기록을 새로 넣을 때가 됐습니다 (구글은 3개월이 지나면 지웁니다)
        </Banner>
      )}
      <label className="search">
        <Icon name="search" size={18} />
        <input type="search" placeholder="새 이름·장소·메모로 찾기" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      {unnamed > 0 && (
        // 이름 미정 칩: 이름 없이 저장한 기록을 나중에 모아서 채우려면 골라낼 수단이 있어야 한다. 그런 기록이 없으면 칩도 없다
        <div className="chips">
          <button type="button" className={`chip${onlyUnnamed ? ' is-on' : ''}`} aria-pressed={onlyUnnamed} onClick={() => setOnlyUnnamed((v) => !v)}>이름 미정 {unnamed}건</button>
        </div>
      )}
      {shown.length === 0 && <p className="hint">{query ? `"${query}"에 맞는 기록이 없습니다.` : '맞는 기록이 없습니다.'}</p>}
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
    </div>
  )
}
