// node --test가 이 파일을 직접 읽는다 (test/saveFile.test.ts) — node는 확장자 없는 경로를 못 푼다
import { isTouchDevice } from '../../app/device.ts'

/**
 * 파일을 넘긴 결과.
 * - 'shared': 공유 창이 "끝났다"고 했다. 아이폰 사파리는 창을 그냥 닫아도 이렇게 답하는 경우가 보고돼 있어 **저장됐다는 증거가 아니다**.
 * - 'downloaded': 내려받기 링크를 눌렀다 — 처음부터 내려받기로 가는 곳(PC, 파일 공유가 없는 터치 브라우저). 실제로 저장됐는지는 브라우저가 알려 주지 않는다.
 * - 'downloaded-after-share': 공유 창을 열려다 거절당해(누름의 유효 시간이 지남 등) 내려받기로 떨어졌다. 폰에서는 알린다 —
 *   홈 화면 앱에서는 내려받기가 조용히 죽는다는 보고가 있어, 다시 누르면 공유 창이 열릴 수 있다 (CardActions).
 * - 'cancelled': 사용자가 공유 창을 닫았다 (AbortError). 파일은 어디에도 남지 않았다.
 * 부르는 쪽은 폰에서는 이 값만 믿고 "저장됨"으로 적지 말고 사용자에게 확인을 받는다 (BackupSection).
 */
export type SaveOutcome = 'shared' | 'downloaded' | 'downloaded-after-share' | 'cancelled'

/**
 * saveFile이 이 파일을 운영체제 공유 창으로 넘길지 — 터치 기기이고 그 형식을 공유할 수 있을 때. 아니면 내려받기다.
 * 공유 창은 버튼을 누른 뒤 짧은 시간(약 5초) 안에만 열린다. 오래 걸려 만드는 파일(카드 영상)은 이것을 먼저 보고,
 * 다 만든 뒤 한 번 더 누르게 해서 그 누름 안에서 saveFile을 부른다 (CardActions).
 */
export function opensShareSheet(blob: Blob, filename: string): boolean {
  return isTouchDevice() && navigator.canShare?.({ files: [new File([blob], filename, { type: blob.type })] }) === true
}

/**
 * 만든 파일을 사용자에게 넘긴다.
 * 폰(터치 기기)에서는 운영체제 공유 창을 연다 — 아이폰에서 내려받기 링크는 "파일" 앱으로 가 버려서
 * 사진첩에 넣으려면 공유 창의 "이미지 저장"을 거쳐야 한다. 그 밖에는 바로 내려받는다.
 * (안드로이드 크롬은 ZIP 같은 형식을 공유 창에 넘기지 못하게 막아 두어 canShare가 거짓이다 — 그때도 내려받기로 간다.)
 * 공유 창이 AbortError 아닌 이유로 실패하면(버튼을 누른 지 오래돼 제스처가 만료된 경우 등) 내려받기로 떨어지고 'downloaded-after-share'를 돌려준다.
 * 공유 창은 이 함수를 부른 그 자리에서(기다리는 일 없이) 연다 — 부르는 쪽이 누름 안에서 곧바로 부르면 제스처가 살아 있다.
 */
export async function saveFile(blob: Blob, filename: string): Promise<SaveOutcome> {
  let triedShare = false
  if (opensShareSheet(blob, filename)) {
    triedShare = true
    try { await navigator.share({ files: [new File([blob], filename, { type: blob.type })] }); return 'shared' } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return 'cancelled'
      // 공유가 막힌 환경이면 아래 내려받기로 떨어진다
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  // 바로 해제하면 일부 브라우저에서 내려받기가 시작되기 전에 주소가 죽는다
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return triedShare ? 'downloaded-after-share' : 'downloaded'
}
