/**
 * 앱 전체가 쓰는 데이터 모양. 기록(Sighting)은 브라우저 로컬 DB와 백업 파일에 그대로 들어간다.
 * **백업 파일에 들어가는 모양은 가산 확장만 한다** — 키를 바꾸거나 지우면 옛 백업이 안 열린다.
 */

/** 위치가 어디서 왔는지. v1의 location_source와 같다 ('tracklog' = 구글 타임라인 이동 기록으로 추정 — features/record/useTrackMatch.ts) */
export type LocationSource = 'exif' | 'tracklog' | 'gps' | 'manual' | 'none'

/** 종 판정 진행 상태. 기록 저장과 판정이 분리돼 있어서 기록마다 따로 든다 */
export type IdentifyStatus = 'none' | 'waiting' | 'done'

/**
 * 옛 카드 등급 (2026-09-22에 뺐다 — 새에 등급을 매기지 않는다). 백업 호환을 위해 필드만 남긴다.
 * 옛 기록의 카드 색은 이 값으로 정한다 (`features/dex/cardStyle.ts`). 새 기록은 늘 1이다.
 */
export type CardTier = 1 | 2 | 3 | 4

/** 카드의 색과 효과. 저장할 때 사진에서 뽑은 색이 들어가고, 사용자가 바꿀 수 있다. 없으면 옛 tier의 색으로 읽는다 */
export interface CardStyle {
  /** 강조색 '#RRGGBB' — 테두리·라벨·빛 */
  accent: string
  /** 빛 줄기와 바깥 빛을 쓸지 */
  glow: boolean
}

/** 사실 도장 */
export type Stamp = '천연기념물' | '멸종위기' | '길잃은새'

/** 픽셀 단위 크기 한 쌍 */
export interface Dimensions {
  width: number
  height: number
}

/**
 * 정규화 상자. 네 값 모두 0~1이고 **EXIF 회전을 적용한 원본 프레임**이 기준이다.
 * 픽셀로 되돌리는 것은 실제로 잘라내는 그 순간뿐이다 (v1과 같은 약속).
 */
export interface NormalizedBox {
  x1: number
  y1: number
  x2: number
  y2: number
}

/** 탐지 상자 하나 */
export interface DetectBox extends NormalizedBox {
  /** 0~1 신뢰도 */
  score: number
}

/** 촬영 정보. 값이 없는 항목은 키 자체가 없다 */
export interface ShotInfo {
  cameraModel?: string
  lensModel?: string
  /** mm */
  focalLength?: number
  fNumber?: number
  /** 초 단위 실수. `1/200` 표기는 표시 형식일 뿐이다 */
  exposureTime?: number
  iso?: number
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
  /** 어느 모델이 판정했는지 — 나중에 "왜 이 기록만 이상하지?"를 추적하는 재료 */
  model: string
  /**
   * 판정하면서 실제로 읽은 자료. **모델이 적어 낸 것이 아니라 도구가 실제로 돌려준 것**에서 모은다 —
   * 모델은 주소를 지어낼 수 있지만, 도구 결과의 주소는 지어낼 수 없다. 옛 기록에는 없을 수 있다.
   */
  references?: Reference[]
}

/** 판정에 쓰인 자료 한 건. 사용자가 눌러서 원문을 보고, 참고 사진을 자기 사진과 견줘 본다 */
export interface Reference {
  title: string
  url: string
  /** 그 문서의 대표 사진 주소. 없는 문서도 있다 */
  image?: string
}

export interface Sighting {
  /** UUID — 기기 두 대에서 만든 기록이 백업을 합칠 때 충돌하지 않게 */
  id: string
  /** 비어 있으면 "이름 미정" */
  speciesKo: string
  latin: string
  /** 촬영 순간 (UTC ISO). 사진에 시각이 없으면 기록한 시각 */
  capturedAt: string
  /** '+09:00' — capturedAt과 합쳐 촬영지 시각을 복원한다. 모르면 null (브라우저 시간대로 표시) */
  capturedAtOffset: string | null
  createdAt: string
  /** 백업을 합칠 때 같은 id 중 어느 쪽이 최신인지 가리는 기준 */
  updatedAt: string
  place: string
  lat: number | null
  lng: number | null
  locationSource: LocationSource
  shot: ShotInfo
  note: string
  /** 잘라낸 영역. 직접 기록만 했고 자르지 않았으면 null */
  cropBox: NormalizedBox | null
  /** 그 상자를 만든 탐지 모델 id. 손으로 잘랐으면 'manual' */
  detectorModel: string | null
  /** 쓰지 않는다 (옛 백업 호환). 새 기록은 1. 카드 모양은 `cardStyle`이 정한다 */
  tier: CardTier
  /** 카드의 색·효과. 옛 기록에는 없다 — 그때는 tier로 색을 정한다 */
  cardStyle?: CardStyle
  stamps: Stamp[]
  /** 보호가 필요한 종 — 카드와 지도에서 위치를 가린다 */
  sensitive: boolean
  identify: IdentifyStatus
  /** AI의 이름을 그대로 받아들였을 때만 남긴다 */
  verdict?: Verdict
  /** 도감 번호 — 이 종이 내 도감에 몇 번째로 들어왔는지 (카드의 No.). 이름 없는 기록과 옛 기록에는 없다 */
  dexNo?: number
  fromSound: boolean
}

/** 사진 한 장의 세 가지 판. 'crop'은 잘라낸 적이 있을 때만 있다 */
export type PhotoKind = 'full' | 'thumb' | 'crop'
