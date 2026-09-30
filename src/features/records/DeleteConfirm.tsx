import { useState } from 'react'
import { useJournal } from '../../data/journal'
import Button from '../../ui/Button'

interface Props {
  /** 지울 기록 */
  id: string
  /** 삭제가 끝났을 때 — 이 기록은 이제 없으니 목록으로 */
  onDeleted: () => void
  /** 실패 이유를 수정 칸의 안내 줄에 적는다. 다시 시도할 때 먼저 ''로 비운다 */
  onError: (message: string) => void
}

/**
 * 수정 칸 맨 아래의 기록 삭제 — '이 기록 삭제'를 누르면 같은 자리에서 한 번 더 묻는다 (records/RecordEdit).
 * 지우는 동안과 실패한 뒤에도 이 자리에 머물고, 실패 이유는 onError로 넘긴다.
 */
export default function DeleteConfirm({ id, onDeleted, onError }: Props) {
  const { remove } = useJournal()
  const [confirming, setConfirming] = useState(false)

  /** 기록과 사진을 지우고 목록으로 */
  async function removeRecord() {
    onError('')
    try {
      await remove(id)
      onDeleted()
    } catch (e) {
      onError(e instanceof Error ? e.message : '삭제하지 못했습니다.')
    }
  }

  // 삭제는 되돌릴 수 없다 — 한 번 더 묻는다. 대화 상자 대신 같은 자리에서 묻는다
  return confirming ? (
    <div className="row-actions">
      <Button variant="danger" icon="trash" onClick={() => void removeRecord()}>정말 삭제</Button>
      <Button variant="quiet" onClick={() => setConfirming(false)}>그만두기</Button>
    </div>
  ) : <Button variant="danger" icon="trash" onClick={() => setConfirming(true)}>이 기록 삭제</Button>
}
