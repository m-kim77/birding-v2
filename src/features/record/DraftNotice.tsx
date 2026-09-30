import { Banner } from '../../ui/bits'
import Button from '../../ui/Button'
import { recentTimeOf } from '../../ui/when'
import { draftCount, type Draft } from '../../data/draft'
import { VERDICT_NOUN } from '../identify/verdictText'

/**
 * "쓰던 기록이 있습니다" 안내. 사진을 고르기 전 화면에만 나온다 — 새 사진을 고른 뒤에는 그쪽이 새 초안이 된다.
 * 이어 쓰기 / 버리기: 초안을 말없이 되살리면 "왜 남의 사진이 떠 있지?"가 되고, 말없이 버리면 어제 쓴 메모가 사라진다. 둘 다 사용자가 골라야 한다.
 */
export default function DraftNotice({ draft, onResume, onDiscard }: { draft: Draft; onResume: () => void; onDiscard: () => void }) {
  const when = recentTimeOf(draft.savedAt)
  // 적어 둔 칸을 모두 적는다 — 빠진 칸이 있으면 '버리기'를 누를 때 그 값이 말없이 사라진다. 개체 수는 옛 초안에 없거나 모양이 틀릴 수 있어 draftCount로 읽는다
  const what = [draft.name && `"${draft.name}"`, draftCount(draft).trim() && '개체 수', draft.verdict && VERDICT_NOUN, draft.note && '메모'].filter(Boolean).join(' · ')
  return (
    <Banner tone="info" icon="edit" action={
      <div className="row-actions">
        <Button variant="primary" onClick={onResume}>이어 쓰기</Button>
        <Button variant="quiet" onClick={onDiscard}>버리기</Button>
      </div>
    }>
      쓰던 기록이 있습니다{when ? ` (${when})` : ''}{what ? ` — ${what}` : ''}.
    </Banner>
  )
}
