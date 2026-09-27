import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import { currentEntry, openLayer, subscribeNav, type BackLayer } from './nav'
import type { NavEntry } from './navPlan'

/** 지금 칸(= 지금 화면). 뒤로가기·화면 이동으로 칸이 바뀌면 다시 그린다. App이 어느 화면을 그릴지 정할 때 쓴다 */
export function useNavEntry(): NavEntry {
  return useSyncExternalStore(subscribeNav, currentEntry)
}

/**
 * 겹(시트·수정 모드)을 폰의 뒤로가기와 묶는다. active인 동안 방문 기록에 칸이 하나 있고, 뒤로가기가 그 칸을 걷으면 onClose를 부른다.
 * 다른 길(닫기 버튼·바깥 누르기·저장)로 active가 꺼지거나 컴포넌트가 사라지면 칸을 스스로 걷는다.
 * ui/Sheet.tsx가 늘 부르므로 시트는 따로 할 일이 없다. 시트가 아닌 겹(상세의 수정 모드)은 그 화면이 부른다.
 */
export function useBackLayer(active: boolean, onClose: () => void): void {
  // 부모가 그릴 때마다 새 함수를 넘겨도 칸을 다시 쌓지 않게, 마지막 것만 기억해 둔다
  const latest = useRef(onClose)
  useLayoutEffect(() => { latest.current = onClose })
  const layer = useRef<BackLayer | null>(null)
  useEffect(() => {
    if (!active) return
    // 개발 모드(StrictMode)는 effect를 걷었다가 곧바로 다시 건다 — 새 칸을 쌓지 말고 걷으려던 칸을 다시 쓴다 (쌓으면 앞 칸이 헛칸으로 남는다)
    if (!layer.current?.keep()) layer.current = openLayer(() => latest.current())
    const mine = layer.current
    return () => mine.release()
  }, [active])
}
