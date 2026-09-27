import { useSyncExternalStore } from 'react'
import { currentEntry, subscribeNav } from './nav'
import type { NavEntry } from './navPlan'

/** 지금 칸(= 지금 화면). 뒤로가기·화면 이동으로 칸이 바뀌면 다시 그린다. App이 어느 화면을 그릴지 정할 때 쓴다 */
export function useNavEntry(): NavEntry {
  return useSyncExternalStore(subscribeNav, currentEntry)
}
