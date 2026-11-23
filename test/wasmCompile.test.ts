import test from 'node:test'
import assert from 'node:assert/strict'
import { canCompileWasm } from '../src/features/detect/wasmCompile.ts'

test('canCompileWasm: 막지 않는 곳(node의 WebAssembly)에서는 true', () => {
  assert.equal(canCompileWasm(), true)
})

test('canCompileWasm: CSP가 컴파일을 막으면(사파리 15 이하 — CompileError) 던지지 않고 false', () => {
  const blocked = {
    Module: class {
      constructor() { throw new WebAssembly.CompileError("WebAssembly.Module(): Refused to compile because 'unsafe-eval' is not an allowed source") }
    },
  }
  assert.equal(canCompileWasm(blocked), false)
})

test('canCompileWasm: WebAssembly가 아예 없으면(잠금 모드 등) false', () => {
  // undefined를 넘기면 기본값(이 node의 WebAssembly)이 들어가므로 null로 '없음'을 흉내 낸다
  assert.equal(canCompileWasm(null), false)
})

test('canCompileWasm: 빈 모듈 하나만 컴파일해 본다 — wasm 머리 8바이트', () => {
  const seen: Uint8Array[] = []
  const recording = { Module: class { constructor(bytes: Uint8Array) { seen.push(bytes) } } }
  assert.equal(canCompileWasm(recording), true)
  assert.deepEqual([...seen[0]], [0, 97, 115, 109, 1, 0, 0, 0])
})
