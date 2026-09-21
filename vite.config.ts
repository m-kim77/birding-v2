import { readFileSync } from 'node:fs'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { apiPlugin } from './dev/apiPlugin'

const mediapipe = JSON.parse(readFileSync('node_modules/@mediapipe/tasks-vision/package.json', 'utf8')) as { version: string }

export default defineConfig(({ mode }) => {
  // api/*.ts는 process.env를 읽는다. 개발 때는 .env.local의 값을 넣어 준다 (VITE_ 접두사가 없어 브라우저로는 나가지 않는다)
  Object.assign(process.env, loadEnv(mode, process.cwd(), 'LOCAL_'))
  return {
    plugins: [react(), apiPlugin()],
    define: { __MEDIAPIPE_VERSION__: JSON.stringify(mediapipe.version) },
  }
})
