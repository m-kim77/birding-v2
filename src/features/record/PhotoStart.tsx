import type { ReactNode } from 'react'
import type { Draft } from '../../data/draft'
import { ScreenHead } from '../../ui/bits'
import Button from '../../ui/Button'
import Icon from '../../ui/Icon'
import DraftNotice from './DraftNotice'

interface Props {
  onBack: () => void
  /** '사진 고르기'를 눌렀을 때 — 숨은 파일 칸을 연다 */
  onPick: () => void
  /** '사진 없이 기록'을 눌렀을 때 — 빠른 기록 화면으로 */
  onQuick: () => void
  /** 숨은 파일 칸. 작성 화면의 '사진 바꾸기'와 같은 칸이라 RecordFlow가 만들어 넘긴다 */
  input: ReactNode
  /** 되살릴 수 있는 초안. 없으면 null */
  draft: Draft | null
  onResume: () => void
  onDiscard: () => void
  /** 사진을 열지 못했을 때의 안내. 없으면 null */
  error: ReactNode
  /** '새소리 듣기'를 눌렀을 때. 없으면 버튼을 그리지 않는다 — 판정기가 시험용 가짜인 배포판 (sound/soundModel.ts soundEntryOn) */
  onSound?: () => void
}

/**
 * 사진을 고르기 전의 첫 화면 — 사진 고르기 한 칸과, 쓰던 기록이 있으면 "이어 쓰기 / 버리기". 그 아래에 사진 없이 기록과 새소리 듣기로 가는 버튼.
 * 사진을 열면 RecordFlow가 작성 화면으로 바꾼다. 열지 못하면 이 화면에 머물고 `error`를 보여 준다.
 */
export default function PhotoStart({ onBack, onPick, onQuick, input, draft, onResume, onDiscard, error, onSound }: Props) {
  return (
    <div className="screen">
      <ScreenHead title="새 기록" onBack={onBack} />
      {input}
      {draft && <DraftNotice draft={draft} onResume={onResume} onDiscard={onDiscard} />}
      <button type="button" className="photo-drop" onClick={onPick}>
        <Icon name="camera" size={40} /><strong>사진 고르기</strong><span>시각·위치·촬영 정보는 사진에서 자동으로 읽습니다</span>
      </button>
      {error}
      {/* 사진 없이 기록: 망원경으로만 본 새·찍기 전에 날아간 새를 남기는 길. "+"는 지금처럼 곧바로 사진 기록으로 오고, 이것은 두 번이면 닿는다.
          사진 고르기가 주 버튼이라 그 아래의 조용한 버튼이다. 쓰던 사진 기록(이어 쓰기)은 건드리지 않는다 */}
      <div className="quick-entry">
        <Button variant="quiet" icon="edit" onClick={onQuick}>사진 없이 기록</Button>
        <span className="hint">망원경으로만 본 새도 남깁니다</span>
      </div>
      {onSound && (
        // 새소리 듣기: 안 보이는 새를 소리로 알아보는 길. 탭이나 "+" 시트가 아니라 여기 둔 이유 — 사진 기록은 지금처럼 한 번에 닿고, 새소리는 두 번이면 닿는다.
        // 기록을 만들지 않으므로 주 버튼(사진 고르기) 아래의 조용한 버튼이고, 그 사실을 바로 밑에 적는다
        <div className="sound-entry">
          <Button variant="quiet" icon="mic" onClick={onSound}>새소리 듣기</Button>
          <span className="hint">들린 새를 알려 줍니다 · 기록은 남기지 않습니다</span>
        </div>
      )}
    </div>
  )
}
