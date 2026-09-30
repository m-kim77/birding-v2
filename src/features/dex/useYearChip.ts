import { useEffect, useState } from 'react'

/**
 * 마지막으로 고른 도감의 "올해" 칩 켜짐. 화면(App.tsx)은 기록 상세로 가면 도감을 치웠다 돌아올 때 새로 그리므로,
 * 컴포넌트 상태에만 두면 기록 하나를 열었다 돌아올 때마다 칩이 풀린다 — 되살린 스크롤 위치도 다른(더 긴) 목록에 맞춰진다
 * (일지의 records/useJournalView.ts와 같은 까닭).
 * 모듈 변수라 새로고침하면 풀린다. 저장소(localStorage·IndexedDB·방문 기록)에 적지 않는다 — 다음에 열었을 때 걸려 있으면 종이 사라진 줄 안다.
 */
let remembered = false

/**
 * "올해" 칩의 켜짐과 뒤집는 함수. 돌아오면 마지막 값으로 시작한다.
 * `visible`이 false(칩이 안 보임)면 꺼진 값을 주고 기억도 끈다 — 칩이 다시 보일 때 말없이 켜진 채로 나오지 않게.
 * 기록을 읽는 중이면 null을 넘긴다 (빈 도감으로 견주면 켜 둔 칩이 풀린다).
 */
export function useYearChip(visible: boolean | null): [boolean, () => void] {
  const [stored, setStored] = useState(() => remembered)
  const on = visible === false ? false : stored
  // 끈 값을 기억에도 적는다 — 안 적으면 칩이 다시 보일 때 켜 두었던 옛 값이 되살아난다
  useEffect(() => {
    if (on === stored) return
    remembered = on
    setStored(on)
  }, [on, stored])
  const toggle = () => {
    remembered = !on
    setStored(!on)
  }
  return [on, toggle]
}
