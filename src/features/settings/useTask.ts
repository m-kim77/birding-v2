import { useState } from 'react'

/** 설정 카드의 결과 한 줄. ok = 됐다, warn = 안 됐거나 사용자가 할 일이 남았다 */
export type TaskMessage = { tone: 'ok' | 'warn'; text: string }

interface Options {
  /** 던진 것이 Error가 아닐 때 결과 줄에 적을 말. 없으면 '실패했습니다.' */
  failText?: string
  /** 일이 끝난 뒤(성공·실패 모두) 할 일 — 저장소를 다시 읽는 등. 화면은 저장소가 지금 말하는 것만 보여 준다 */
  after?: () => void | Promise<void>
}

/**
 * 설정 카드의 "누르면 → 진행 중 → 결과 한 줄" 틀. 백업·이동 기록·저장 공간·AI·드라이브 카드가 함께 쓴다.
 * `run(work)`는 진행 중(`busy`)으로 두고 지난 결과를 지운 뒤 일을 돌린다. 일이 돌려준 결과(null이면 줄을 비운다)나
 * **던진 이유를 결과 줄에 적는다 — 조용히 실패하지 않는다.** 결과 줄은 TaskResult로 그린다.
 * `setMessage`는 일 없이 줄만 바꿀 때 (지웠다고 알리기·다른 것을 고르면 비우기).
 */
export function useTask({ failText = '실패했습니다.', after }: Options = {}) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<TaskMessage | null>(null)

  /** 일을 돌리고 결과나 실패 이유를 결과 줄에 적는다. 던지지 않는다 */
  async function run(work: () => Promise<TaskMessage | null>) {
    setBusy(true)
    setMessage(null)
    try { setMessage(await work()) } catch (e) { setMessage({ tone: 'warn', text: e instanceof Error ? e.message : failText }) } finally { setBusy(false); await after?.() }
  }

  return { busy, message, setMessage, run }
}
