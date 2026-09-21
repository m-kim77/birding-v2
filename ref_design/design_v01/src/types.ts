/**
 * 초안이 쓰는 데이터 모양. v1 `src/types.ts`·`server/db.js`를 단순화한 것이다.
 * 제품의 데이터 모델은 계획서에서 따로 확정한다 — 여기 모양을 그대로 가져가지 않는다.
 */

/** 위치가 어디서 왔는지. v1의 location_source와 같다 */
export type LocationSource = 'exif' | 'tracklog' | 'gps' | 'manual' | 'none'

/** 종 판정 진행 상태. 기록 저장과 판정이 분리돼 있어서 기록마다 따로 든다 */
export type IdentifyStatus = 'none' | 'waiting' | 'running' | 'done' | 'server-down'

/** 카드 등급. 1이 가장 차분하고 4가 가장 화려하다. 나누는 기준은 `features/dex/cardTier.ts` 한 곳에만 있다 */
export type CardTier = 1 | 2 | 3 | 4

/** 등급과 별개로 찍는 사실 도장 */
export type Stamp = '천연기념물' | '멸종위기' | '길잃은새'

export interface Sighting {
  /** 제품에서는 UUID (기기 두 대에서 만든 기록이 충돌하지 않게) */
  id: string
  /** 비어 있으면 "이름 미정" — 판정이 끝나기 전에도 저장할 수 있다 */
  speciesKo: string
  latin: string
  /** 촬영지 시각 기준 ISO. 표시 전용이라 초안에서는 시간대 처리를 하지 않는다 */
  capturedAt: string
  place: string
  lat: number | null
  lng: number | null
  locationSource: LocationSource
  /** 한 줄 촬영 정보. 예: "600mm · f/6.3 · 1/2000s · ISO 800" */
  exifLine: string
  note: string
  /** 사진 주소. 못 불러오면 PhotoBox가 자리 표시로 대신한다 */
  photo: string
  tier: CardTier
  stamps: Stamp[]
  /** 보호가 필요한 종 — 카드와 공유 화면에서 위치를 시·군까지만 보여 준다 */
  sensitive: boolean
  identify: IdentifyStatus
  /** 소리로 만든 기록이면 true (사진 대신 소리 그림을 보여 준다) */
  fromSound: boolean
}

/** 사진에서 찾은 새 상자. 0~1 정규화 좌표 [x1, y1, x2, y2] — v1 crop_box와 같은 약속 */
export interface DetectBox {
  box: [number, number, number, number]
  score: number
}

/** AI 판정 결과 */
export interface Verdict {
  /** '확정'이면 한 종으로 좁혀졌고, '좁힘'이면 후보가 남았다 */
  kind: '확정' | '좁힘'
  speciesKo: string
  latin: string
  summary: string
  /** 근거 문장과 출처. 결과를 믿을지 사용자가 판단하는 재료다 */
  evidence: Array<{ text: string; source: string }>
  /** '좁힘'일 때 남은 후보 */
  others: string[]
}

/** 소리 분석 결과 한 종 */
export interface SoundHit {
  speciesKo: string
  latin: string
  /** 0~1 */
  confidence: number
  /** 이 종이 들린 구간들 (초) */
  ranges: Array<[number, number]>
}

/** 초안 보기 도구에서 고르는 상황. 제품에는 없다 — 상태 화면을 눈으로 확인하려는 장치다 */
export type Scenario = 'normal' | 'no-model' | 'server-down' | 'no-bird'
