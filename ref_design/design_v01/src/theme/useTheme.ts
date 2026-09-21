import { useEffect, useState } from 'react'
import { applyTokens, loadChoice, resolveTheme, saveChoice } from './applyTheme'

/**
 * 기기의 다크 모드 설정을 구독한다. 설정이 바뀌면 다시 그린다.
 */
function usePrefersDark(): boolean {
  const query = '(prefers-color-scheme: dark)'
  const [dark, setDark] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setDark(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return dark
}

/**
 * 테마 선택 상태를 들고, 바뀔 때마다 문서 루트에 토큰을 적용한다.
 * `forceDark`는 초안 보기 도구가 "심플·모던"의 다크 쪽을 기기 설정과 무관하게 확인할 때만 쓴다.
 */
export function useTheme(forceDark: boolean | null = null) {
  const [choice, setChoice] = useState(loadChoice)
  const systemDark = usePrefersDark()
  const dark = forceDark ?? systemDark

  useEffect(() => {
    applyTokens(document.documentElement, resolveTheme(choice, dark).tokens)
  }, [choice, dark])

  /** 선택을 바꾸고 저장한다 */
  function choose(next: string) {
    setChoice(next)
    saveChoice(next)
  }

  return { choice, choose }
}
