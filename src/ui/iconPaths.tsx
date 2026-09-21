import type { ReactNode } from 'react'

/**
 * 선 아이콘 한 세트. 이모지를 아이콘으로 쓰지 않는다 — 운영체제마다 모양이 달라 디자인이 흔들린다.
 * 24×24 격자, 선 굵기는 CSS(.icon)에서 정한다. 대부분 v1 `Icon.tsx`에서 가져왔다.
 */
export const ICON_PATHS = {
  book: <><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H11v18H7.5A3.5 3.5 0 0 0 4 23.5Z"/><path d="M20 5.5A3.5 3.5 0 0 0 16.5 2H13v18h3.5a3.5 3.5 0 0 1 3.5 3.5Z"/></>,
  cards: <><rect x="4" y="6" width="12" height="15" rx="2"/><path d="M8 3h10a2 2 0 0 1 2 2v13"/></>,
  map: <><path d="m3 6 5-3 8 3 5-3v15l-5 3-8-3-5 3Z"/><path d="M8 3v15M16 6v15"/></>,
  gear: <><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  camera: <><path d="M4 7h3l1.5-2h7L17 7h3v12H4Z"/><circle cx="12" cy="13" r="4"/></>,
  mic: <><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6"/></>,
  pin: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  aperture: <><circle cx="12" cy="12" r="9"/><path d="m14.5 3.5-5 8.5M20.5 9h-10M18 17.5 13 9M9.5 20.5l5-8.5M3.5 15h10M6 6.5 11 15"/></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></>,
  back: <path d="M15 5l-7 7 7 7"/>,
  close: <path d="M6 6l12 12M18 6 6 18"/>,
  check: <path d="m5 12 4 4L19 6"/>,
  sparkle: <><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z"/><path d="M19 16v4M17 18h4"/></>,
  crop: <><path d="M6 2v16h16"/><path d="M2 6h16v16"/></>,
  play: <path d="m9 7 8 5-8 5Z"/>,
  pause: <path d="M9 6v12M15 6v12"/>,
  stop: <rect x="7" y="7" width="10" height="10" rx="1.5"/>,
  upload: <><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/></>,
  download: <><path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 16v4h16v-4"/></>,
  share: <><path d="M12 15V3M8 7l4-4 4 4"/><path d="M6 11H5v10h14V11h-1"/></>,
  edit: <><path d="M4 20h4L19 9l-4-4L4 16Z"/><path d="m13 7 4 4"/></>,
  trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/></>,
  wave: <path d="M3 12h2M7 8v8M11 4v16M15 9v6M19 7v10M22 12h-1"/>,
  bird: <><path d="M3 14c3 0 5-1 7-4 1.5-2.5 4-4 7-3l4-1-3 3c0 5-4 9-9 9H5l2-3"/><circle cx="16.5" cy="9.5" r=".6"/></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></>,
  alert: <><path d="M12 3 2 20h20Z"/><path d="M12 10v5M12 17.5v.5"/></>,
  chevron: <path d="m9 6 6 6-6 6"/>,
  phone: <><rect x="7" y="2" width="10" height="20" rx="2.5"/><path d="M11 18.5h2"/></>,
  monitor: <><rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></>,
} satisfies Record<string, ReactNode>

export type IconName = keyof typeof ICON_PATHS
