import { useMemo } from 'react'
import InstallHint from '../../app/InstallHint'
import { useJournal } from '../../data/journal'
import { Banner, ScreenHead } from '../../ui/bits'
import Button from '../../ui/Button'
import Icon from '../../ui/Icon'
import { countSpecies } from '../dex/speciesCount'
import JournalFilter from './JournalFilter'
import JournalNotices from './JournalNotices'
import { countUnnamed, sortNewest } from './journalList'
import { filterJournal, periodOptions, placeOptions } from './journalView'
import RecordList from './RecordList'
import { useJournalView } from './useJournalView'

interface Props {
  onOpen: (id: string) => void
  onBackup: () => void
  onAdd: () => void
  /** 설정 화면으로 (이동 기록 알림의 "설정으로" — 파일을 넣는 곳이 설정의 이동 기록 카드다) */
  onSettings: () => void
}

/** 기록이 0건일 때의 첫 화면 — 새 기록, 백업에서 불러오기, 설치 안내. 기록이 한 건이라도 생기면 일지 목록으로 바뀐다 */
function EmptyJournal({ onAdd, onBackup }: Pick<Props, 'onAdd' | 'onBackup'>) {
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

/**
 * 첫 화면이자 기록 목록. 홈 화면을 따로 두지 않고 요약을 목록 맨 위에 얹었다.
 * 검색 칸 하나와 그 아래 거르기 줄(JournalFilter) — 기간·장소 고르개와 "이름 미정" 칩. 검색어로는 날짜를 못 찾고, 장소는 이름을 기억해 쳐야 해서 둘만 고르개로 둔다.
 * 종으로 거르는 고르개는 두지 않는다 (검색 칸과 도감의 종 시트가 한다). 정렬은 날짜순 하나다.
 * 알림 띠는 JournalNotices, 목록 그리기는 RecordList, 거르기·묶기 계산은 journalList.ts·journalView.ts가 맡는다.
 * 검색어·칩·기간·장소는 기록을 열었다 돌아와도 남는다 (useJournalView — 이번 실행 동안만).
 */
export default function RecordsScreen({ onOpen, onBackup, onAdd, onSettings }: Props) {
  const journal = useJournal()
  const sightings = useMemo(() => journal.sightings ?? [], [journal.sightings])
  const sorted = useMemo(() => sortNewest(sightings), [sightings])
  const periods = useMemo(() => periodOptions(sightings), [sightings])
  const places = useMemo(() => placeOptions(sightings), [sightings])
  const unnamed = countUnnamed(sightings)
  const [view, setView] = useJournalView(journal.sightings && { unnamed, periods, places })
  const shown = filterJournal(sorted, view)
  const speciesCount = countSpecies(sightings)

  if (journal.sightings === null) return <div className="screen"><p className="hint">기록을 읽는 중…</p></div>
  if (journal.error) return <div className="screen"><Banner tone="err" icon="alert">{journal.error}</Banner></div>
  if (sightings.length === 0) return <EmptyJournal onAdd={onAdd} onBackup={onBackup} />

  return (
    <div className="screen">
      <ScreenHead title="일지" sub={`날짜순 · 기록 ${sightings.length}건 · ${speciesCount}종`} />
      <JournalNotices onBackup={onBackup} onSettings={onSettings} />
      <label className="search">
        <Icon name="search" size={18} />
        <input type="search" placeholder="새 이름·장소·메모로 찾기" value={view.query} onChange={(e) => setView({ ...view, query: e.target.value })} />
      </label>
      <JournalFilter view={view} onChange={setView} periods={periods} places={places} unnamed={unnamed} shownCount={shown.length} shownSpecies={countSpecies(shown)} />
      {shown.length === 0 && <p className="hint">{view.query ? `"${view.query}"에 맞는 기록이 없습니다.` : '맞는 기록이 없습니다.'}</p>}
      <RecordList shown={shown} onOpen={onOpen} />
    </div>
  )
}
