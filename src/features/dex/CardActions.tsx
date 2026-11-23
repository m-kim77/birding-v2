import { useState } from 'react'
import Button from '../../ui/Button'
import { fileDateOf } from '../../ui/when'
import type { Sighting } from '../../types'
import { cardImage, cardVideo } from './cardExport'
import { opensShareSheet, saveFile, type SaveOutcome } from './saveFile'
import { useDexNo } from './useDexNo'

/** 파일 이름에 못 쓰는 글자를 뺀다. 날짜는 촬영지 기준 (UTC로 자르면 새벽 사진이 전날이 된다) */
function fileBase(s: Sighting): string {
  return `${s.speciesKo || '새카드'}-${fileDateOf(s)}`.replace(/[\\/:*?"<>|\s]+/g, '_')
}

/** 폰에서 만들어 두고 '영상 공유하기'를 기다리는 영상. `of`는 만든 때의 기록 판 (versionOf) */
interface MadeVideo { blob: Blob; name: string; of: string }

/** 기록의 지금 판. 영상을 만든 뒤 카드 색을 바꾸는 등 기록이 바뀌면 만들어 둔 영상은 옛 카드라 버린다 */
function versionOf(s: Sighting): string {
  return `${s.id}:${s.updatedAt}`
}

/**
 * 넘긴 결과를 사용자에게 알릴 문구. 알릴 것이 없으면 빈 글자.
 * 공유 창을 열려다 내려받기로 떨어졌을 때만 알린다 — 홈 화면 앱에서는 그 내려받기가 조용히 실패할 수 있다 (saveFile.ts).
 * 처음부터 내려받기로 가는 곳(PC, 파일 공유가 없는 터치 브라우저)의 'downloaded'는 알리지 않는다 — 다시 눌러도 같은 내려받기다.
 */
function outcomeText(outcome: SaveOutcome): string {
  if (outcome === 'cancelled') return '저장을 취소했습니다.'
  if (outcome === 'downloaded-after-share') return '공유 창이 열리지 않아 내려받기로 넘겼습니다. 내려받은 파일에 없으면 다시 저장해 주세요.'
  return ''
}

/**
 * 카드 저장 버튼 둘. 카드가 보이는 모든 곳(저장 직후·도감·기록 상세)에서 같은 것을 쓴다.
 *
 * - 이미지 저장: 카드는 남에게 보여 주려고 만드는 것이다.
 * - 영상 저장: 뒤집히며 나타나는 장면은 화면 안에서만 살아 있다. 밖으로 가져가려면 영상이어야 한다.
 * "공유하기"를 따로 두지 않았다 — 폰에서는 두 버튼이 공유 창을 열고(saveFile.ts), PC에서는 바로 내려받는다.
 * 다만 폰의 영상은 녹화에 4초 넘게 걸려 누름의 유효 시간(약 5초)을 넘길 수 있다 — 그래서 다 만든 뒤 '영상 공유하기'를 한 번 더 누르게 하고,
 * 그 누름 안에서 공유 창을 연다. 공유 창을 닫으면 만든 영상은 남아 다시 누를 수 있다.
 */
export default function CardActions({ sighting, primary = true }: { sighting: Sighting; /** 같은 화면에 이미 주 버튼이 있으면 false (주 버튼은 화면마다 하나) */ primary?: boolean }) {
  const [busy, setBusy] = useState<'image' | 'video' | 'share' | null>(null)
  const [error, setError] = useState('')
  const [made, setMade] = useState<MadeVideo | null>(null)
  // 내보내는 카드에도 화면의 카드와 같은 번호를 적는다 (계산값 — dex/dexNo.ts)
  const dexNo = useDexNo(sighting.speciesKo)
  // 다른 기록으로 바뀌었거나(도감에서 다른 종) 이 기록이 고쳐졌으면 만들어 둔 영상은 보이지 않는다
  const ready = made?.of === versionOf(sighting) ? made : null

  /**
   * 파일을 만들어 넘긴다. 실패하면 이유를, 공유 창을 닫았거나 폰에서 내려받기로 떨어졌으면 그 사실을 버튼 아래에 적는다 (조용히 끝나지 않는다).
   * 폰에서 공유 창으로 갈 영상은 넘기지 않고 만들어 두기만 한다 — '영상 공유하기'가 넘긴다.
   */
  async function run(kind: 'image' | 'video') {
    setBusy(kind)
    setError('')
    setMade(null)
    try {
      if (kind === 'image') {
        setError(outcomeText(await saveFile(await cardImage(sighting, dexNo), `${fileBase(sighting)}.png`)))
        return
      }
      const v = await cardVideo(sighting, dexNo)
      const name = `${fileBase(sighting)}.${v.ext}`
      if (opensShareSheet(v.blob, name)) { setMade({ blob: v.blob, name, of: versionOf(sighting) }); return }
      setError(outcomeText(await saveFile(v.blob, name)))
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했습니다')
    } finally {
      setBusy(null)
    }
  }

  /**
   * 만들어 둔 영상을 공유 창으로 넘긴다 — 이 누름 안에서 기다리는 일 없이 곧바로 연다 (누름의 유효 시간이 새로 시작된다).
   * 공유 창을 닫았으면 영상을 남겨 다시 누를 수 있게 하고, 넘겼거나 내려받기로 떨어졌으면 비운다.
   */
  async function share(video: MadeVideo) {
    setBusy('share')
    setError('')
    try {
      const outcome = await saveFile(video.blob, video.name)
      if (outcome !== 'cancelled') setMade(null)
      setError(outcomeText(outcome))
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했습니다')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="card-actions">
      <div className="row-actions">
        <Button variant={primary ? 'primary' : 'secondary'} icon="download" onClick={() => run('image')} disabled={busy !== null}>{busy === 'image' ? '만드는 중…' : '이미지 저장'}</Button>
        <Button icon="play" onClick={() => run('video')} disabled={busy !== null}>{busy === 'video' ? '녹화하는 중… (4초)' : '영상 저장'}</Button>
      </div>
      {ready && (
        <>
          <p className="status-line">영상을 만들었습니다. 공유 창에서 저장하거나 보내세요.</p>
          {/* 영상 공유하기: 녹화가 길어 첫 누름으로는 공유 창이 거절될 수 있다 — 새 누름 안에서 연다 (폰에서만 보인다) */}
          <Button icon="share" onClick={() => void share(ready)} disabled={busy !== null}>영상 공유하기</Button>
        </>
      )}
      {error && <p className="status-line is-warn" role="alert">{error}</p>}
    </div>
  )
}
