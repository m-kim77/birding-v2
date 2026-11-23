import { Suspense, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import Icon from '../ui/Icon'
import { currentEntry, setScrollReader } from './nav'
import { TABS, type TabName } from './routes'

interface Props {
  active: TabName | null
  onTab: (tab: TabName) => void
  onAdd: () => void
  /** 기록하기·소리처럼 한 가지 일에 집중하는 화면에서는 내비게이션을 숨긴다 */
  hideNav: boolean
  /** 화면이 바뀔 때마다 달라지는 값. 바뀌면 스크롤을 맨 위로 — 뒤로 돌아온 화면이면 떠날 때의 위치로 — 옮긴다 */
  screenKey: string
  /** 지금 화면. 화면 조각을 받는 동안은 그 자리에 '불러오는 중…'이 보인다 */
  children: ReactNode
}

/**
 * 화면이 실제로 그려진 때 `run`을 한 번 부른다 — 받는 중이던 화면 조각이 와서 '불러오는 중…'이 빠진 때도.
 * 화면과 같은 Suspense 안에 두어, 대체 화면만 그려진 동안에는 부르지 않는다. 부르는 쪽이 화면마다 key를 바꿔 새로 단다.
 * 한 번만 부른다 — Suspense가 화면을 숨겼다 다시 보일 때도 layout effect가 다시 도는데, 그때는 사용자가 옮겨 둔 스크롤을 건드리지 않는다.
 */
function OnShown({ run }: { run: () => void }) {
  const done = useRef(false)
  useLayoutEffect(() => {
    if (done.current) return
    done.current = true
    run()
  }, [run])
  return null
}

/**
 * 앱의 뼈대. 같은 마크업이 폭에 따라 하단 탭(폰) 또는 왼쪽 사이드바(PC)가 된다.
 * 배치 전환은 CSS 컨테이너 쿼리가 한다 (styles/shell.css) — 그래서 초안 보기 도구의 폰 프레임 안에서도,
 * 실제 폰에서도 같은 규칙으로 바뀐다. 웹용·앱용 컴포넌트를 따로 두지 않는다.
 */
export default function AppShell({ active, onTab, onAdd, hideNav, screenKey, children }: Props) {
  const main = useRef<HTMLElement>(null)
  // 스크롤 영역이 화면들 사이에 공유되므로, 안 되돌리면 목록을 내린 위치 그대로 다음 화면이 열린다.
  // 뒤로 돌아온 화면은 떠날 때 칸에 적어 둔 위치로 (app/nav.ts). 그리기 전에 옮겨야 맨 위가 한 번 번쩍이지 않는다.
  // 화면이 실제로 그려진 때 옮긴다 (OnShown) — 이 탭에서 처음 여는 화면(새로 고친 뒤 뒤로 돌아온 도감 등)은 조각을 받는 동안
  // '불러오는 중…'이 먼저 그려지는데, 그 짧은 화면에 옮기면 0으로 잘려 맨 위에서 열린다
  const restoreScroll = () => { main.current?.scrollTo(0, currentEntry().scroll ?? 0) }
  useEffect(() => setScrollReader(() => main.current?.scrollTop ?? 0), [])
  const [left, right] = [TABS.slice(0, 2), TABS.slice(2)]
  const tabButton = (tab: (typeof TABS)[number]) => (
    <button key={tab.name} type="button" className={`nav-item${active === tab.name ? ' is-active' : ''}`}
      aria-current={active === tab.name ? 'page' : undefined} onClick={() => onTab(tab.name)}>
      <Icon name={tab.icon} size={22} /><span>{tab.label}</span>
    </button>
  )
  return (
    <div className={`app${hideNav ? ' app-focus' : ''}`}>
      <main className="app-main" ref={main}>
        <Suspense fallback={<div className="screen"><p className="hint">불러오는 중…</p></div>}>
          {children}
          {/* key는 화면의 key(App.tsx LoadBoundary — screenKey)와 겹치지 않게 앞에 붙인다: 같은 자리의 형제 key가 같으면 React가 옛 화면을 지우지 못해 숨긴 채 남긴다 */}
          <OnShown key={`shown:${screenKey}`} run={restoreScroll} />
        </Suspense>
      </main>
      {!hideNav && (
        <nav className="app-nav" aria-label="주 메뉴">
          <div className="nav-brand">탐조일지</div>
          {left.map(tabButton)}
          <button type="button" className="nav-add" onClick={onAdd} aria-label="새 기록">
            <Icon name="plus" size={26} /><span>새 기록</span>
          </button>
          {right.map(tabButton)}
        </nav>
      )}
    </div>
  )
}
