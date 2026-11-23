/**
 * 설정의 '받은 모델' 줄(settings/ModelSection)에 보이는 크기 글. node --test로 검사한다 (test/modelText.test.ts). import를 두지 않는다.
 */

/**
 * 받은 모델 한 줄의 크기 글.
 * 다 받아 뒀으면(0) 이 기기에 차지하는 양 — '지우기'로 돌려받는 양이다. 일부만 있으면 더 받을 양, 하나도 없으면 처음 받을 양.
 * 한 숫자로만 보이면 '지우기' 옆의 10MB가 돌려받을 공간처럼 읽히는데, 새 찾기는 wasm이 풀린 채로 들어가 실제로는 약 18MB다 (점검 5-9 검토).
 * 아직 재는 중이면(null) 빈 글 — 받아 둔 기기에서 '받을 양 10MB'가 잠깐 보였다가 바뀌지 않게. `storedMb`가 없으면 `sizeMb`와 같다고 본다.
 */
export function modelSizeText(missingMb: number | null, sizeMb: number, storedMb = sizeMb): string {
  if (missingMb === null) return ''
  if (missingMb === 0) return `이 기기에 약 ${storedMb}MB`
  if (missingMb < sizeMb) return `더 받을 양 약 ${missingMb}MB`
  return `받을 양 약 ${sizeMb}MB`
}
