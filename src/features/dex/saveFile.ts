/**
 * 만든 파일을 사용자에게 넘긴다.
 * 폰(터치 기기)에서는 운영체제 공유 창을 연다 — 아이폰에서 내려받기 링크는 "파일" 앱으로 가 버려서
 * 사진첩에 넣으려면 공유 창의 "이미지 저장"을 거쳐야 한다. 그 밖에는 바로 내려받는다.
 * 사용자가 공유 창을 그냥 닫은 것(AbortError)은 실패가 아니므로 조용히 끝낸다.
 */
export async function saveFile(blob: Blob, filename: string): Promise<void> {
  const file = new File([blob], filename, { type: blob.type })
  const touch = window.matchMedia('(pointer: coarse)').matches
  if (touch && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
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
}
