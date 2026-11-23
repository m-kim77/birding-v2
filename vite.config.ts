import { readFileSync } from 'node:fs'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { apiPlugin } from './dev/apiPlugin'

/**
 * vercel.json에서 모든 경로(`/(.*)`)에 붙는 머리 — CSP·iframe 막기 등. 그런 규칙이 없으면 빈 객체.
 * `npm run preview`(빌드한 판)도 배포와 같은 머리로 내보내, 바깥 주소를 더했을 때 CSP에 막히는지 배포 전에 콘솔에서 본다.
 * 개발 서버(`npm run dev`)에는 붙이지 않는다 — React 새로 고침이 인라인 스크립트를 써서 CSP에 막힌다.
 */
function siteHeaders(): Record<string, string> {
  const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as { headers?: { source: string; headers: { key: string; value: string }[] }[] }
  const all = vercel.headers?.find((rule) => rule.source === '/(.*)')?.headers ?? []
  return Object.fromEntries(all.map((h) => [h.key, h.value]))
}

export default defineConfig(({ mode }) => {
  // api/*.ts는 process.env를 읽는다. 개발 때는 .env.local의 값을 넣어 준다 (VITE_ 접두사가 없어 브라우저로는 나가지 않는다)
  // LOCAL_ = 기본 제공 AI, GOOGLE_·DRIVE_ = 드라이브 로그인 (api/drive.ts)
  Object.assign(process.env, loadEnv(mode, process.cwd(), ['LOCAL_', 'GOOGLE_', 'DRIVE_']))
  return {
    plugins: [react(), apiPlugin()],
    preview: { headers: siteHeaders() },
  }
})
