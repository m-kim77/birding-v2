import type { ReactNode } from 'react'
import type { Draft } from '../../data/draft'
import { ScreenHead } from '../../ui/bits'
import Icon from '../../ui/Icon'
import DraftNotice from './DraftNotice'

interface Props {
  onBack: () => void
  /** '사진 고르기'를 눌렀을 때 — 숨은 파일 칸을 연다 */
  onPick: () => void
  /** 숨은 파일 칸. 작성 화면의 '사진 바꾸기'와 같은 칸이라 RecordFlow가 만들어 넘긴다 */
  input: ReactNode
  /** 되살릴 수 있는 초안. 없으면 null */
  draft: Draft | null
  onResume: () => void
  onDiscard: () => void
  /** 사진을 열지 못했을 때의 안내. 없으면 null */
  error: ReactNode
}

/**
 * 사진을 고르기 전의 첫 화면 — 사진 고르기 한 칸과, 쓰던 기록이 있으면 "이어 쓰기 / 버리기".
 * 사진을 열면 RecordFlow가 작성 화면으로 바꾼다. 열지 못하면 이 화면에 머물고 `error`를 보여 준다.
 */
export default function PhotoStart({ onBack, onPick, input, draft, onResume, onDiscard, error }: Props) {
  return (
    <div className="screen">
      <ScreenHead title="새 기록" onBack={onBack} />
      {input}
      {draft && <DraftNotice draft={draft} onResume={onResume} onDiscard={onDiscard} />}
      <button type="button" className="photo-drop" onClick={onPick}>
        <Icon name="camera" size={40} /><strong>사진 고르기</strong><span>시각·위치·촬영 정보는 사진에서 자동으로 읽습니다</span>
      </button>
      {error}
    </div>
  )
}
