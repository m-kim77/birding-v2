import { useState } from 'react'
import Button from '../ui/Button'
import Icon from '../ui/Icon'
import { dismissInstallHint, needsInstallHint } from './device'

interface Props {
  /** 이미 기록이 있으면 "먼저 백업"을 말해야 한다 — 홈 화면 앱은 사파리와 저장소가 따로라 기록이 따라오지 않는다 */
  hasRecords: boolean
  /** 백업 화면으로 (기록이 있을 때만 그린다) */
  onBackup: () => void
}

/**
 * 아이폰 사파리 탭에서 열었을 때 한 번 보이는 "홈 화면에 추가" 안내.
 * 사파리는 7일 동안 쓰지 않은 사이트의 저장소를 지우고, 홈 화면 앱은 그 대상이 아니다. 그런데 홈 화면 앱은 **사파리와 저장소가 분리**돼 있어
 * (WebKit 181849 — 의도된 설계), 기록이 있는 사람에게 "추가하라"고만 하면 새 앱이 텅 빈 채 열린다. 그래서 기록 유무에 따라 말이 다르다.
 * 닫으면 다시 안 뜬다 — 사파리의 공유 버튼을 앱이 대신 눌러 줄 수는 없어서, 안내 말고는 할 수 있는 것이 없다.
 */
export default function InstallHint({ hasRecords, onBackup }: Props) {
  const [show, setShow] = useState(needsInstallHint)
  if (!show) return null
  const close = () => { dismissInstallHint(); setShow(false) }
  return (
    <div className="banner banner-warn install-hint" role="status">
      <Icon name="phone" size={18} />
      <div>
        {hasRecords ? (
          <p>사파리는 7일 동안 이 사이트를 쓰지 않으면 저장한 기록을 지웁니다. 공유 버튼 → <strong>홈 화면에 추가</strong>로 열면 지워지지 않는데, 홈 화면 앱은 저장소가 따로라 <strong>먼저 백업 파일을 내려받고 그 앱에서 불러와야</strong> 합니다.</p>
        ) : (
          <p>사파리는 7일 동안 이 사이트를 쓰지 않으면 저장한 기록을 지웁니다. 기록을 만들기 전에 공유 버튼 → <strong>홈 화면에 추가</strong>로 열어 쓰면 지워지지 않습니다.</p>
        )}
        <div className="row-actions">
          {hasRecords && <Button variant="quiet" icon="download" onClick={onBackup}>백업하기</Button>}
          <Button variant="quiet" onClick={close}>닫기</Button>
        </div>
      </div>
    </div>
  )
}
