import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures')

/**
 * 픽스처 경로를 돌려주되 **없으면 즉시 던진다.**
 * 조용히 건너뛰면 `npm run check`가 통과해도 아무것도 확인하지 않은 것이 된다 — 없으면 시끄럽게 실패해야 한다.
 */
export function fixture(name: string): string {
  const p = path.join(FIXTURES, name)
  if (!existsSync(p)) throw new Error(`픽스처가 없습니다: ${p}`)
  return p
}
