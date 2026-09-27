/**
 * 파일·함수 크기가 v2 CLAUDE.md "파일 크기와 책임"의 상한을 넘는지 검사한다.
 * 빈 줄과 주석은 세지 않는다 (주석을 많이 달수록 불리해지면 안 된다).
 *
 * 함수 길이는 이미 있는 `typescript` 파서로 함수를 찾아 잰다 (새 패키지 없음). 안쪽 함수는 바깥 함수의 줄 수에도 들어간다
 * (ESLint max-lines-per-function과 같은 셈). 상한을 넘으면 실패, 목표를 넘으면 표시만 한다.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'

const ROOT = join(import.meta.dirname, '..', 'src')
const LIMITS: Record<string, { goal: number; max: number }> = {
  '.tsx': { goal: 150, max: 300 },
  '.ts': { goal: 200, max: 400 },
  '.css': { goal: 250, max: 400 },
}
/** 함수 하나 (CLAUDE.md) */
const FN_LIMIT = { goal: 40, max: 80 }
/** 상한 예외: 데이터 표는 길어도 된다 */
const EXEMPT = new Set(['theme/themes.ts', 'data/species.ts', 'ui/iconPaths.tsx'])

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

/** 함수의 이름. 이름이 없으면 담긴 변수·속성 이름, 훅에 넘긴 함수면 `useEffect(…)`처럼, 그것도 아니면 '(이름 없음)' */
function nameOf(fn: ts.FunctionLikeDeclaration, sf: ts.SourceFile): string {
  if (fn.name) return fn.name.getText(sf)
  const p = fn.parent
  if ((ts.isVariableDeclaration(p) || ts.isPropertyAssignment(p)) && p.name) return p.name.getText(sf)
  if (ts.isCallExpression(p)) return `${p.expression.getText(sf)}(…)`
  return '(이름 없음)'
}

/**
 * 파일 하나의 함수마다 이름·시작 줄·코드 줄 수. 몸통이 없는 선언(오버로드·declare)은 뺀다.
 * 함수 앞의 JSDoc은 세지 않는다 (getStart가 앞 주석을 건너뛴다). 안쪽 함수는 바깥 함수에도 세고 따로도 센다.
 */
function functionSizes(file: string, text: string): Array<{ name: string; line: number; lines: number }> {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const out: Array<{ name: string; line: number; lines: number }> = []
  const visit = (node: ts.Node) => {
    if (ts.isFunctionLike(node) && 'body' in node && node.body) {
      const fn = node as ts.FunctionLikeDeclaration
      const start = fn.getStart(sf)
      out.push({ name: nameOf(fn, sf), line: sf.getLineAndCharacterOfPosition(start).line + 1, lines: codeLines(text.slice(start, fn.end)) })
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}

let over = 0
for (const file of walk(ROOT)) {
  const ext = Object.keys(LIMITS).find((e) => file.endsWith(e) && !(e === '.ts' && file.endsWith('.tsx')))
  if (!ext) continue
  const rel = relative(ROOT, file)
  if (EXEMPT.has(rel)) continue
  const text = readFileSync(file, 'utf8')
  const n = codeLines(text)
  const { goal, max } = LIMITS[ext]
  if (n > max) { over++; console.log(`✗ ${rel}  ${n}줄 > 상한 ${max}`) }
  else if (n > goal) console.log(`· ${rel}  ${n}줄 (목표 ${goal} 초과, 상한 ${max} 이내)`)
  if (ext === '.css') continue
  for (const f of functionSizes(file, text)) {
    if (f.lines > FN_LIMIT.max) { over++; console.log(`✗ ${rel}:${f.line} ${f.name}  함수 ${f.lines}줄 > 상한 ${FN_LIMIT.max}`) }
    else if (f.lines > FN_LIMIT.goal) console.log(`· ${rel}:${f.line} ${f.name}  함수 ${f.lines}줄 (목표 ${FN_LIMIT.goal} 초과, 상한 ${FN_LIMIT.max} 이내)`)
  }
}
console.log(over ? `\n상한 초과 ${over}건 — 기능을 더하기 전에 먼저 쪼갠다` : '파일·함수 크기 검사 통과')
process.exit(over ? 1 : 0)
