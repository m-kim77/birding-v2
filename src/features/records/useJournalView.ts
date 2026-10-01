import { useEffect, useState } from 'react'
import { ALL_VIEW, keepValid, type JournalView, type ViewChoices } from './journalView'

/**
 * 마지막으로 본 일지의 보는 방식. 화면(App.tsx)은 상세로 가면 일지를 치웠다 돌아올 때 새로 그리므로,
 * 컴포넌트 상태에만 두면 기록 하나를 열었다 돌아올 때마다 검색어·칩이 풀린다 — 되살린 스크롤 위치도 다른(더 긴) 목록에 맞춰진다.
 * 모듈 변수라 새로고침하면 풀린다. 저장소(localStorage·IndexedDB·방문 기록)에 적지 않는다 — 다음에 열었을 때 걸려 있으면 기록이 사라진 줄 안다.
 */
let remembered: JournalView = ALL_VIEW

/**
 * 일지의 보는 방식과 바꾸는 함수. 돌아오면 마지막 값으로 시작한다.
 * `choices`가 있으면 사라진 선택을 전체로 되돌린 값을 주고 기억도 고친다 (keepValid) — 기록을 읽는 중이면 null을 넘긴다
 * (빈 목록으로 견주면 고른 것이 전부 풀린다).
 */
export function useJournalView(choices: ViewChoices | null): [JournalView, (next: JournalView) => void] {
  const [stored, setStored] = useState(() => remembered)
  const view = choices ? keepValid(stored, choices) : stored
  // 되돌린 값을 기억에도 적는다 — 안 적으면 같은 장소의 기록이 다시 생길 때 풀렸던 선택이 말없이 되살아난다
  useEffect(() => {
    if (view === stored) return
    remembered = view
    setStored(view)
  }, [view, stored])
  const update = (next: JournalView) => {
    remembered = next
    setStored(next)
  }
  return [view, update]
}
