import type { TaskMessage } from './useTask'

/**
 * 설정 카드의 결과 한 줄 (useTask). 결과가 없으면 아무것도 그리지 않는다.
 * role="status" — 화면 읽기 프로그램이 누른 뒤에 나온 결과를 읽어 준다.
 */
export default function TaskResult({ message }: { message: TaskMessage | null }) {
  if (!message) return null
  return <p className={`status-line is-${message.tone}`} role="status">{message.text}</p>
}
