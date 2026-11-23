/// <reference types="vite/client" />

/** 설치된 @mediapipe/tasks-vision의 버전. vite.config.ts가 빌드 때 넣는다 */
declare const __MEDIAPIPE_VERSION__: string

/** exifr의 가벼운 판 (lib/exif.ts loadExifr). 패키지는 전체판 경로의 타입만 내놓는다 — 모양은 같다 */
declare module 'exifr/dist/lite.esm.mjs' {
  export * from 'exifr'
  export { default } from 'exifr'
}
