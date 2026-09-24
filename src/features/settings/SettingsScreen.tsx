import { Card, ScreenHead } from '../../ui/bits'
import AiSection from './AiSection'
import BackupSection from './BackupSection'
import LicenseSection from './LicenseSection'
import ModelSection from './ModelSection'
import ThemePicker from './ThemePicker'
import TracksSection from './TracksSection'
import './settings.css'

interface Props {
  choice: string
  onChoose: (id: string) => void
}

/**
 * 설정. 중요한 순서대로 위에서 아래로: 백업 → 테마 → AI 연결 → 이동 기록 → 받은 모델 → 출처.
 * 구역마다 파일이 하나다 — 구역을 더할 때 이 파일에는 한 줄만 더한다.
 */
export default function SettingsScreen({ choice, onChoose }: Props) {
  return (
    <div className="screen screen-settings">
      <ScreenHead title="설정" />
      <BackupSection />
      <Card><h2>화면 테마</h2><ThemePicker choice={choice} onChoose={onChoose} /></Card>
      <AiSection />
      <TracksSection />
      <ModelSection />
      <LicenseSection />
    </div>
  )
}
