/**
 * 백업 카드(settings/BackupSection)의 문구를 만드는 순수 함수. node --test로 검사한다.
 */
// 확장자를 적는 이유: node --test가 이 파일을 직접 읽는다 (Vite는 어느 쪽이든 된다)
import { daysAgoOf } from '../../ui/when.ts'

/** 불러오기 결과에서 문구가 쓰는 칸 (data/backup.ts ImportResult) — 기록 목록은 건수만 본다 */
export interface ImportSummary {
  /** 새로 들어온 기록 */
  add: { length: number }
  /** 백업 쪽이 더 최신이라 갱신한 기록 */
  update: { length: number }
  /** 기기 쪽이 같거나 더 최신이라 그대로 둔 기록 수 */
  kept: number
  /** 읽지 못해 건너뛴 기록 수 */
  skipped: number
}

/**
 * 백업 상태 한 줄. 마지막 백업이 없거나 못 읽는 값이면(`daysAgoOf`가 null) 안 된 기록 수와 상관없이 "아직 백업한 적 없음".
 * 백업한 적이 있으면 백업 안 된 기록이 있는지(`unsaved` — 마지막 백업 뒤에 바뀐 기록 수)에 따라 앞 말이 갈리고, 전체 수와 경과 일수가 붙는다.
 * 경과 일수의 날짜 경계는 브라우저 시간대다 (`now`는 검사를 위해 받는다).
 */
export function backupStatusText(unsaved: number, total: number, lastBackupAt: string, now = new Date()): string {
  const ago = daysAgoOf(lastBackupAt, now)
  return ago ? `${unsaved ? `백업 안 된 기록 ${unsaved}건` : '모든 기록이 백업돼 있습니다'} · 전체 ${total}건 · 마지막 백업 ${ago}` : `아직 백업한 적 없음 · 전체 ${total}건`
}

/**
 * 백업 파일 불러오기가 끝났을 때의 결과 한 줄: 새 기록·갱신·그대로 둔 기록 수.
 * 건너뛴 기록은 말없이 넘기지 않는다 — 파일에 있던 기록이 안 보이면 사용자는 유실로 안다. 건너뛴 것이 없으면 그 말은 붙이지 않는다.
 */
export function importResultText(plan: ImportSummary): string {
  const skipped = plan.skipped > 0 ? ` · 읽지 못한 기록 ${plan.skipped}건은 건너뛰었습니다` : ''
  return `불러왔습니다 — 새 기록 ${plan.add.length}건, 갱신 ${plan.update.length}건, 그대로 둔 기록 ${plan.kept}건${skipped}`
}
