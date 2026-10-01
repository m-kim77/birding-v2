import { useState } from 'react'
import { isTouchDevice } from '../../app/device'
import InstallHint from '../../app/InstallHint'
import { BACKUP_NUDGE_AT, useJournal } from '../../data/journal'
import { dismissTrackNudge, loadTrackNudgeDismissed, needsTrackRefresh } from '../tracks/refreshNudge'
import { useTracksMeta } from '../tracks/useTracksMeta'
import { Banner } from '../../ui/bits'
import Button from '../../ui/Button'

/**
 * 백업 알림을 띄우는 기준 건수. 브라우저가 저장소 보존을 거절한 **폰**에서는 1건부터 — 폰은 저장 공간이 자주 모자라고, 모자라면 이 앱의 자료부터 지워진다.
 * PC에서는 거절돼도 5건 기준을 지킨다 (PC 브라우저가 저장소를 지우는 일은 드물어서, 매번 띄우면 알림에 무뎌진다).
 */
function nudgeAt(persisted: boolean | null): number {
  return persisted === false && isTouchDevice() ? 1 : BACKUP_NUDGE_AT
}

interface Props {
  /** 백업 화면으로 (설치 안내와 백업 알림의 "백업하기") */
  onBackup: () => void
  /** 설정 화면으로 (이동 기록 알림의 "설정으로" — 파일을 넣는 곳이 설정의 이동 기록 카드다) */
  onSettings: () => void
}

/**
 * 일지 맨 위의 알림 띠 셋 — 설치 안내, 백업 알림, 이동 기록 60일 알림. 띠마다 뜨는 조건과 닫은 기억을 여기서 다룬다.
 * 기록이 한 건 이상일 때만 그린다 (기록 0건 화면은 설치 안내만 따로 띄운다 — RecordsScreen의 EmptyJournal).
 * 조건에 맞는 띠가 없으면 아무것도 그리지 않는다.
 */
export default function JournalNotices({ onBackup, onSettings }: Props) {
  const { unsaved, persisted } = useJournal()
  // 이동 기록 60일 알림. meta가 undefined(읽는 중)·null(없음)이면 안 그린다 — 넣은 적이 없는 사람에게 "새로 넣으라"고 하면 안 된다
  const trackMeta = useTracksMeta().meta
  const [nudgeDismissed, setNudgeDismissed] = useState(loadTrackNudgeDismissed)
  const closeTrackNudge = (importedAt: string) => { dismissTrackNudge(importedAt); setNudgeDismissed(importedAt) }

  return (
    <>
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
    </>
  )
}
