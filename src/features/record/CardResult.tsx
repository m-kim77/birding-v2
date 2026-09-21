import Button from '../../ui/Button'
import type { Sighting } from '../../types'
import BirdCard from '../dex/BirdCard'
import CardActions from '../dex/CardActions'
import { TIER_LABELS, shouldReveal } from '../dex/cardTier'

interface Props {
  sighting: Sighting
  onDone: () => void
}

/**
 * 저장 직후 화면. 방금 만든 기록의 카드를 보여 준다.
 * 처음 본 종일 때만 카드가 뒤집히며 나타난다 — 매번 나오면 세 번째부터 귀찮아진다.
 */
export default function CardResult({ sighting, onDone }: Props) {
  const reveal = shouldReveal(sighting.tier)
  // 이름 없이 저장한 기록 — 카드는 이름이 생긴 뒤에 의미가 있다
  const waiting = !sighting.speciesKo
  return (
    <div className="screen screen-result">
      <p className="result-kicker">{waiting ? '저장했습니다' : TIER_LABELS[sighting.tier]}</p>
      <h1 className="display">{waiting ? '이름은 나중에 기록을 열어 채울 수 있습니다' : reveal ? `${sighting.speciesKo}를 도감에 더했습니다` : '기록을 저장했습니다'}</h1>
      <div className={reveal ? 'card-reveal' : ''}><BirdCard sighting={sighting} /></div>
      <div className="result-actions">
        <Button variant="primary" block onClick={onDone}>완료</Button>
        {/* 저장: 이름이 정해진 카드만. 이름 미정 카드를 내보낼 이유는 없다 */}
        {!waiting && <CardActions sighting={sighting} primary={false} />}
      </div>
    </div>
  )
}
