import { PICKED_PHOTO } from '../../mock/data'
import { Banner, Progress } from '../../ui/bits'
import Button from '../../ui/Button'
import PhotoBox from '../../ui/PhotoBox'
import type { RecordDraft } from './useRecordDraft'

/** 0~1 정규화 상자를 CSS 위치로 바꾼다 */
function boxStyle([x1, y1, x2, y2]: [number, number, number, number]) {
  return { left: `${x1 * 100}%`, top: `${y1 * 100}%`, width: `${(x2 - x1) * 100}%`, height: `${(y2 - y1) * 100}%` }
}

/**
 * 고른 사진과 그 위의 새 상자. 상자를 누르면 그 새가 판정 대상이 된다.
 *
 * "새 찾기" 버튼은 없다 — 모델이 있으면 사진을 고르자마자 자동으로 돈다.
 * "직접 자르기"는 자동 찾기가 도움이 안 될 때(모델 없음·못 찾음·상자가 틀림)에만 나타난다.
 */
export default function DetectView({ draft }: { draft: RecordDraft }) {
  const { boxes, crop, model, download, setCrop, downloadModel } = draft
  const manual = crop === 'manual'

  return (
    <div className="detect">
      <PhotoBox src={PICKED_PHOTO.src} alt="방금 고른 사진">
        {!manual && boxes?.map((b, i) => (
          <button key={i} type="button" className={`detect-box${crop === i ? ' is-picked' : ''}`} style={boxStyle(b.box)}
            onClick={() => setCrop(i)} aria-label={`${i + 1}번째 새 고르기`} aria-pressed={crop === i} />
        ))}
        {manual && <div className="crop-frame" style={boxStyle([0.2, 0.15, 0.8, 0.85])}><i /><i /><i /><i /></div>}
      </PhotoBox>

      {model === 'missing' && (
        // 받기: 수십 MB를 쓰는 일이라 사용자가 눌러야 한다 (자동으로 받지 않는다)
        <Banner tone="info" icon="download" action={<Button variant="secondary" onClick={downloadModel}>받기 (13MB)</Button>}>
          새를 자동으로 찾으려면 모델을 한 번 받아야 합니다. 받은 뒤에는 인터넷 없이도 됩니다.
        </Banner>
      )}
      {model === 'downloading' && (
        <div className="status-line"><span>새 찾기 모델 받는 중 · {Math.round(download * 100)}%</span><Progress value={download} label="모델 다운로드" /></div>
      )}
      {model === 'ready' && boxes === null && <p className="status-line">사진에서 새를 찾는 중…</p>}
      {model === 'ready' && boxes?.length === 0 && !manual && (
        <Banner tone="warn" icon="alert">새를 찾지 못했습니다. 새가 있는 부분을 직접 잘라 주세요.</Banner>
      )}
      {boxes && boxes.length > 1 && crop === null && <p className="status-line">새 {boxes.length}마리를 찾았습니다. 판정할 새를 눌러 고르세요.</p>}
      {typeof crop === 'number' && <p className="status-line is-ok">이 부분으로 판정합니다.</p>}
      {manual && <p className="status-line">모서리를 끌어 새가 가득 차게 맞추세요. (초안에서는 움직이지 않습니다)</p>}

      {!manual && (model !== 'ready' || boxes !== null) && model !== 'downloading' && (
        <Button variant="quiet" icon="crop" onClick={() => setCrop('manual')}>직접 자르기</Button>
      )}
    </div>
  )
}
