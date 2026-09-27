import { Card, ScreenHead } from '../../ui/bits'
import AiSection from './AiSection'
import BackupSection from './BackupSection'
import DriveSection from './DriveSection'
import LicenseSection from './LicenseSection'
import ModelSection from './ModelSection'
import PrivacySection from './PrivacySection'
import StorageSection from './StorageSection'
import ThemePicker from './ThemePicker'
import TracksSection from './TracksSection'
import './settings.css'

interface Props {
  choice: string
  onChoose: (id: string) => void
  /** 저장 공간 카드의 "사진이 빠진 기록"에서 그 기록으로 간다 */
  onOpenRecord: (id: string) => void
}

/**
 * 설정. 중요한 순서대로 위에서 아래로: 백업 → 드라이브 동기화 → 저장 공간 → 테마 → AI 연결 → 이동 기록 → 받은 모델 → 무엇이 어디로 가나요 → 출처.
 * 구역마다 파일이 하나다 — 구역을 더할 때 이 파일에는 한 줄만 더한다.
 */
export default function SettingsScreen({ choice, onChoose, onOpenRecord }: Props) {
  return (
    <div className="screen screen-settings">
      <ScreenHead title="설정" />
      <BackupSection />
      <DriveSection />
      <StorageSection onOpenRecord={onOpenRecord} />
      <Card><h2>화면 테마</h2><ThemePicker choice={choice} onChoose={onChoose} /></Card>
      <AiSection />
      <TracksSection />
      <ModelSection />
      <PrivacySection />
      <LicenseSection />
    </div>
  )
}
