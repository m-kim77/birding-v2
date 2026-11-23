/**
 * 이 페이지에서 wasm을 컴파일할 수 있는지 — 새 찾기를 쓸 수 있는지의 가장 앞 관문.
 * 사파리 15 이하는 CSP의 'wasm-unsafe-eval'을 몰라, 'unsafe-eval'을 열지 않은 우리 CSP(vercel.json)에서는 wasm 컴파일이 막힌다.
 * 막힌 기기에서 받기를 누르면 10MB를 다 받은 뒤에야 탐지기를 못 만들어, 사진을 고를 때마다 '인터넷 연결을 확인해 주세요'가 되풀이됐다 (점검 2-2 검토).
 * 'unsafe-eval'은 열지 않는다(README) — 대신 받기 전에 여기서 가려 '이 브라우저에서는 쓸 수 없다'고 알린다.
 * node --test가 읽는 파일이라 import를 두지 않는다 (test/wasmCompile.test.ts).
 */

/** wasm 머리 8바이트뿐인 빈 모듈 — 컴파일만 해 본다(실행할 것이 없다). 아주 작아 화면 스레드에서 바로 컴파일해도 된다 (크롬은 4KB까지 허락) */
const EMPTY_MODULE = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])

/** 시험에서 바꿔 끼우는 자리 — WebAssembly 가운데 여기서 쓰는 것만 */
interface WasmApi {
  Module: new (bytes: Uint8Array<ArrayBuffer>) => unknown
}

/**
 * 빈 wasm 모듈을 컴파일해 본다. 되면 true.
 * CSP가 막거나(CompileError) WebAssembly가 없거나(잠금 모드 등 — 시험에서는 null로 흉내 낸다) 그 밖에 무엇이 던져지면 false — 던지지 않는다.
 * CSP가 막는 브라우저는 부를 때마다 콘솔에 위반을 한 줄 남긴다 — 한 번만 부르는 것은 부르는 쪽 몫이다 (mediapipeDetector supported).
 */
export function canCompileWasm(wasm: WasmApi | null | undefined = globalThis.WebAssembly): boolean {
  try {
    if (!wasm) return false
    new wasm.Module(EMPTY_MODULE)
    return true
  } catch {
    return false
  }
}
