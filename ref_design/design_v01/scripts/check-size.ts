/**
 * 파일·함수 크기가 v2 CLAUDE.md "파일 크기와 책임"의 상한을 넘는지 검사한다.
 * 빈 줄과 주석은 세지 않는다 (주석을 많이 달수록 불리해지면 안 된다).
 *
 * 함수 길이는 재지 않는다 — 정확히 재려면 파서가 필요하고, 그건 제품에서 ESLint로 한다.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = join(import.meta.dirname, '..', 'src')
const LIMITS: Record<string, { goal: number; max: number }> = {
  '.tsx': { goal: 150, max: 300 },
  '.ts': { goal: 200, max: 400 },
  '.css': { goal: 250, max: 400 },
}
/** 상한 예외: 데이터 표는 길어도 된다 */
const EXEMPT = new Set(['theme/themes.ts', 'mock/data.ts', 'ui/iconPaths.tsx'])

/** 폴더를 재귀로 훑어 파일 경로를 모은다 */
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

/** 빈 줄과 주석 줄을 뺀 줄 수. 블록 주석 안쪽도 뺀다 */
function codeLines(text: string): number {
  let inBlock = false
  let count = 0
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (inBlock) { if (line.includes('*/')) inBlock = false; continue }
    if (!line || line.startsWith('//')) continue
    if (line.startsWith('/*')) { if (!line.includes('*/')) inBlock = true; continue }
    count++
  }
  return count
}

let over = 0
for (const file of walk(ROOT)) {
  const ext = Object.keys(LIMITS).find((e) => file.endsWith(e) && !(e === '.ts' && file.endsWith('.tsx')))
  if (!ext) continue
  const rel = relative(ROOT, file)
  if (EXEMPT.has(rel)) continue
  const n = codeLines(readFileSync(file, 'utf8'))
  const { goal, max } = LIMITS[ext]
  if (n > max) { over++; console.log(`✗ ${rel}  ${n}줄 > 상한 ${max}`) }
  else if (n > goal) console.log(`· ${rel}  ${n}줄 (목표 ${goal} 초과, 상한 ${max} 이내)`)
}
console.log(over ? `\n상한 초과 ${over}건 — 기능을 더하기 전에 먼저 쪼갠다` : '파일 크기 검사 통과')
process.exit(over ? 1 : 0)
