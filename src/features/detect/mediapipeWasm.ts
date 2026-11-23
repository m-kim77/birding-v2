// 새 찾기 실행 파일(로더 js + wasm)은 설치된 패키지에서 빌드가 우리 사이트의 /assets/로 내보낸다 (이름에 내용 해시, vercel.json이 1년 캐시).
// 바깥 CDN(jsDelivr)에서 받지 않는 이유: 로더는 <script>로 페이지에 들어가 앱과 같은 권한으로 돈다 — CDN 쪽 파일이 바뀌면 API 키·기록·드라이브 출입증에
// 닿는다 (점검 2-2). CSP(vercel.json script-src)도 바깥 코드를 막으므로 CDN 주소로 되돌리면 배포판에서 새 찾기가 준비되지 않는다.
// 같은 패키지에서 나오므로 실행 코드(vision_bundle)와 판이 늘 같다 (어긋나면 초기화에서 실패한다).
import simdLoader from '@mediapipe/tasks-vision/vision_wasm_internal.js?url'
import simdBinary from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url'
import plainLoader from '@mediapipe/tasks-vision/vision_wasm_nosimd_internal.js?url'
import plainBinary from '@mediapipe/tasks-vision/vision_wasm_nosimd_internal.wasm?url'

/** 실행 파일 한 벌. `loader`는 <script>로 넣는 주소, `binary`는 Cache Storage에 받아 두는 wasm의 주소(키) */
export interface WasmFiles {
  loader: string
  binary: string
}

/**
 * SIMD 명령 하나가 든 아주 작은 wasm — @mediapipe/tasks-vision의 isSimdSupported가 쓰는 것과 같은 바이트.
 * 그 함수를 부르면 실행 코드(약 130kB)를 먼저 받아야 해서, 받아 둔 것만 보는 화면('+'·설정)이 그 코드를 받게 된다 (점검 5-6).
 */
const SIMD_PROBE = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11])

/**
 * 이 브라우저에 맞는 실행 파일 한 벌. SIMD를 못 쓰는 브라우저(사파리 16.3 이하 등)는 느린 판을 준다 — MediaPipe의 forVisionTasks와 같은 고르기.
 * validate는 컴파일하지 않아 CSP와 상관없다. WebAssembly가 없거나 validate가 던지면 느린 판 (그 브라우저는 어차피 준비에서 실패해 안내가 뜬다).
 */
export function wasmFiles(): WasmFiles {
  let simd = false
  try { simd = WebAssembly.validate(SIMD_PROBE) } catch { /* 위에 적은 대로 */ }
  return simd ? { loader: simdLoader, binary: simdBinary } : { loader: plainLoader, binary: plainBinary }
}

/** 받아 둔 주소가 새 찾기 wasm인지 — 판이 바뀌어 남은 옛 wasm을 지울 때 쓴다 (modelCache.ts dropStale). 주소가 아니면 false */
export function isVisionWasm(url: string): boolean {
  try { return /\/vision_wasm[^/]*\.wasm$/.test(new URL(url).pathname) } catch { return false }
}
