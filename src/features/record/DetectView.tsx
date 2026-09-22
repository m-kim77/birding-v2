import { useState } from 'react'
import { Banner, Progress } from '../../ui/bits'
import Button from '../../ui/Button'
import PhotoBox from '../../ui/PhotoBox'
import type { DetectBox, NormalizedBox } from '../../types'
import CropDrawer from './CropDrawer'
import type { ModelState } from './useDetection'

interface Props {
  photoUrl: string
  ratio: string
  detection: { model: ModelState; download: number; boxes: DetectBox[] | null; error: string; downloadModel: () => void; sizeMb: number }
  /** 지금 고른 영역. 탐지 상자일 수도, 손으로 그린 것일 수도 있다 */
  picked: NormalizedBox | null
  onPick: (box: NormalizedBox, by: 'detector' | 'manual') => void
}

/** 상자를 CSS 위치로 */
function boxStyle(b: NormalizedBox) {
  return { left: `${b.x1 * 100}%`, top: `${b.y1 * 100}%`, width: `${(b.x2 - b.x1) * 100}%`, height: `${(b.y2 - b.y1) * 100}%` }
}

/**
 * 고른 사진과 그 위의 새 상자. 상자를 누르면 그 새가 판정 대상이 된다.
 * "새 찾기" 버튼은 없다 — 모델이 있으면 자동으로 돈다. "직접 자르기"는 자동 찾기가 도움이 안 될 때만 비중 있게 나타난다.
 */
export default function DetectView({ photoUrl, ratio, detection, picked, onPick }: Props) {
  const { model, download, boxes, error, downloadModel, sizeMb } = detection
  const [drawing, setDrawing] = useState(false)
  const searching = model === 'ready' && boxes === null

  return (
    <div className="detect">
      <PhotoBox src={photoUrl} alt="고른 사진" ratio={ratio}>
        {!drawing && boxes?.map((b, i) => (
          <button key={i} type="button" className={`detect-box${picked === b ? ' is-picked' : ''}`} style={boxStyle(b)}
            onClick={() => onPick(b, 'detector')} aria-label={`${i + 1}번째 새 고르기`} aria-pressed={picked === b} />
        ))}
        {!drawing && picked && !boxes?.includes(picked as DetectBox) && <div className="crop-frame" style={boxStyle(picked)} />}
        {drawing && <CropDrawer onDraw={(box) => { onPick(box, 'manual'); setDrawing(false) }} />}
      </PhotoBox>

      {model === 'missing' && !drawing && (
        // 받기: 수 MB를 쓰는 일이라 사용자가 눌러야 한다 (자동으로 받지 않는다)
        <Banner tone="info" icon="download" action={<Button onClick={downloadModel}>받기 ({sizeMb}MB)</Button>}>
          새를 자동으로 찾으려면 모델을 한 번 받아야 합니다. 받은 파일은 이 기기에 남겨 둡니다 (설정에서 지울 수 있습니다).
        </Banner>
      )}
      {model === 'downloading' && <div className="status-line"><span>새 찾기 모델 받는 중 · {Math.round(download * 100)}%</span><Progress value={download} label="모델 다운로드" /></div>}
      {searching && <p className="status-line">사진에서 새를 찾는 중…</p>}
      {error && <Banner tone="warn" icon="alert">{error}</Banner>}
      {drawing && <p className="status-line">새가 가득 차도록 사진 위를 끌어 주세요.</p>}
      {!drawing && boxes?.length === 0 && !picked && !error && <Banner tone="warn" icon="alert">새를 찾지 못했습니다. 새가 있는 부분을 직접 잘라 주세요.</Banner>}
      {!drawing && boxes && boxes.length > 1 && !picked && <p className="status-line">새 {boxes.length}마리를 찾았습니다. 판정할 새를 눌러 고르세요.</p>}

      {!drawing && picked && (
        // 상자가 맞을 때가 대부분이라, 직접 자르기는 버튼이 아니라 같은 줄의 글자 링크로 낮춘다
        <p className="status-line is-ok">이 부분으로 판정합니다. <button type="button" className="text-link" onClick={() => setDrawing(true)}>직접 자르기</button></p>
      )}
      {!drawing && !picked && !searching && model !== 'downloading' && model !== 'checking' && (
        <Button variant="quiet" icon="crop" onClick={() => setDrawing(true)}>직접 자르기</Button>
      )}
    </div>
  )
}
