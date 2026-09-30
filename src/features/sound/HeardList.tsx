import { Tag } from '../../ui/bits'
import { clockOf, lastHeard, nameOf, sortHeard, SURE_SCORE, WINDOW_SECONDS, type HeardSpecies } from './heard'

interface Props {
  heard: HeardSpecies[]
  /** 지금까지 들은(판정한) 소리의 길이(초) */
  seconds: number
  /** 마이크로 듣는 중인지 — 방금 들린 종에 '방금'을 붙인다 */
  live: boolean
}

/**
 * 들린 종 목록. 믿을 만한 종이 위에 온다 (heard.ts sortHeard). 줄은 누를 수 없다 — 이 화면은 판정만 하고 기록을 만들지 않는다
 * (종을 눌러 "들은 기록"을 남기는 것은 다음 작업이다).
 * 국명은 저장된 값이 아니라 그릴 때 붙인다 (heard.ts nameOf). %는 그 종이 가장 또렷하게 들린 창의 점수다.
 */
export default function HeardList({ heard, seconds, live }: Props) {
  return (
    <ul className="heard-list">
      {sortHeard(heard).map((h) => {
        const name = nameOf(h)
        // 마지막 창은 모자란 뒤를 0으로 채운 3초라, 그 끝이 실제로 들은 길이를 넘을 수 있다
        const last = Math.min(lastHeard(h), seconds)
        return (
          <li key={h.latin} className="heard">
            <div className="heard-name">
              <strong className="display">{name.title}</strong>
              {name.sub && <em>{name.sub}</em>}
              <small>{h.spans.length}번 · 마지막 {clockOf(last)}</small>
            </div>
            <div className="heard-side">
              <span className="heard-score">{Math.round(h.peak * 100)}%</span>
              {/* 방금: 목록이 길어져도 지금 우는 새가 어느 줄인지 보이게. 판정은 창 하나만큼 늦게 오므로 그만큼 너그럽게 본다 */}
              {live && last >= seconds - WINDOW_SECONDS && <Tag tone="accent">방금</Tag>}
              {h.peak < SURE_SCORE && <Tag tone="warn">확실하지 않음</Tag>}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
