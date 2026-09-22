import { useJournal } from '../../data/journal'
import Button from '../../ui/Button'
import type { Sighting } from '../../types'
import CardActions from '../dex/CardActions'
import CardReveal from '../dex/CardReveal'
import CardStylePicker from '../dex/CardStylePicker'

interface Props {
  sighting: Sighting
  /** 이 이름을 처음 기록했는지 — 그때만 카드가 뒤집히며 나타난다 (매번 나오면 세 번째부터 귀찮아진다) */
  firstMeet: boolean
  onDone: () => void
}

/**
 * 저장 직후 화면. 방금 만든 기록의 카드를 보여 주고, 색을 바로 고칠 수 있다.
 * 카드는 저장소의 최신 기록으로 그린다 — 색을 바꾸면 여기서도 바로 바뀌어야 한다.
 */
export default function CardResult({ sighting, firstMeet, onDone }: Props) {
  const { sightings } = useJournal()
  const live = (sightings ?? []).find((s) => s.id === sighting.id) ?? sighting
  // 이름 없이 저장한 기록 — 카드는 이름이 생긴 뒤에 의미가 있다
  const waiting = !live.speciesKo
  return (
    <div className="screen screen-result">
      <p className="result-kicker">{waiting ? '저장했습니다' : firstMeet ? '처음 만난 새' : '다시 만난 새'}</p>
      <h1 className="display">{waiting ? '이름은 나중에 기록을 열어 채울 수 있습니다' : firstMeet ? `${live.speciesKo}를 도감에 더했습니다` : `${live.speciesKo}를 기록했습니다`}</h1>
      <CardReveal sighting={live} animate={firstMeet && !waiting} />
      <CardStylePicker sighting={live} />
      <div className="result-actions">
        <Button variant="primary" block onClick={onDone}>완료</Button>
        {/* 저장: 이름이 정해진 카드만. 이름 미정 카드를 내보낼 이유는 없다 */}
        {!waiting && <CardActions sighting={live} primary={false} />}
      </div>
    </div>
  )
}
