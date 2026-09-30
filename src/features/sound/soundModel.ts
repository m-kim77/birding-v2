import type { SoundClassifier } from './classifier'
import { makeFakeClassifier } from './fakeClassifier'

/**
 * 지금 쓰는 새소리 판정기. **진짜 모델을 붙일 때 이 줄만 바꾼다** — 화면·규칙·설정의 받은 모델 줄은 이 값만 본다.
 * 지금은 시험용 가짜다 (작업 31이 폰에서 통과한 뒤에 BirdNET 2.4 어댑터로 바꾼다 — WORK_ORDERS 작업 32).
 */
export const soundClassifier: SoundClassifier = makeFakeClassifier()

/**
 * 새소리 듣기를 열어 둘지 — 들어가는 버튼(새 기록 첫 화면)·설정의 받은 모델 줄·"무엇이 어디로 가나요"의 줄이 함께 본다.
 * 판정기가 가짜인 동안 배포판에서는 닫는다: 가짜 답을 진짜처럼 보여 주지 않고, 동작하지 않는 버튼을 미리 두지 않는다 (CLAUDE.md).
 * 가짜여도 여는 곳: 개발 서버, 그리고 `VITE_SOUND_DEMO=1`로 빌드한 판 — 폰의 마이크는 https에서만 열려서
 * 폰에서 화면을 보려면 Vercel 미리보기(Preview 환경변수)에 이 값을 넣는다. 진짜 판정기면 늘 연다.
 */
export const soundEntryOn: boolean = !soundClassifier.demo || import.meta.env.DEV || import.meta.env.VITE_SOUND_DEMO === '1'
