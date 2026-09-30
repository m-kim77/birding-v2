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
  /**
   * '확정'이면 한 종으로 좁혀졌고, '좁힘'이면 후보가 남았다. **저장값이다 — 글자를 바꾸지 않는다** (읽을 때 이 두 값이 아니면
   * 판정을 통째로 버리므로 옛 기록의 근거가 사라지고, 모델과의 약속·고정 프롬프트도 같은 글자다). 화면에 보이는 말은 `identify/verdictText.ts`가 정한다
   */
  kind: '확정' | '좁힘'
  /** 확인된 국명. 확인하지 못했으면 빈 문자열이다 — 학명이나 영어 이름을 대신 넣지 않는다 (작업 20, `identify/parseVerdict.ts`) */
  speciesKo: string
  latin: string
  /**
   * 모델이 국명 자리에 적었지만 버린 글 (영어 이름이거나, 자료에서 확인되지 않은 이름). 있으면 `speciesKo`는 비어 있다.
   * 화면이 "무엇을 왜 안 넣었는지" 알리는 재료다. 이름이 빈 판정은 기록에 붙지 않으므로 저장된 기록에는 없다.
   */
  unverifiedName?: string
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
  /** 촬영 순간 (UTC ISO). 사진에 시각이 없으면 기록한 시각. 사진 없는 기록(`noPhoto`)은 사람이 적은 본 시각 */
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
  /**
   * 촬영 정보(`shot`)를 사람이 기록 상세의 '수정'에서 한 번이라도 고쳤다는 표시. 키가 없으면 사진에서 읽은 그대로다. true만 쓴다.
   * 저장된 사진은 캔버스로 다시 만든 것이라 EXIF가 없다 — 고친 뒤에는 사진에서 다시 읽을 수 없으니, 손으로 적은 값이 사진 값처럼 보이지 않게 남긴다.
   * `shot` 안이 아니라 형제 키인 이유: 읽을 때(data/normalizeSighting.ts) `shot`은 아는 여섯 키만 남겨서 안에 두면 백업·드라이브를 돌고 오며 사라진다.
   */
  shotEdited?: true
  note: string
  /** 잘라낸 영역. 직접 기록만 했고 자르지 않았으면 null */
  cropBox: NormalizedBox | null
  /** 그 상자를 만든 탐지 모델 id. 손으로 잘랐으면 'manual' */
  detectorModel: string | null
  /** 쓰지 않는다 (옛 백업 호환). 새 기록은 1. 카드 모양은 `cardStyle`이 정한다 */
  tier: CardTier
  /** 카드의 색·효과. 옛 기록에는 없다 — 그때는 tier로 색을 정한다 */
  cardStyle?: CardStyle
  /**
   * 새 기록에는 '천연기념물'·'멸종위기'를 넣지 않는다 (buildSighting은 빈 배열). 종의 보호 지위는 볼 때 국명으로 찾는다 (data/protectedSpecies.ts —
   * 기록 상세의 보호종 줄) — 저장하면 이름을 고칠 때마다 다시 계산해야 하고, 목록이 개정되면 옛 기록에 옛 표시가 남는다.
   * 다만 **카드(화면 BirdCard · 이미지·영상 cardCanvas)는 아직 이 배열을 그대로 그리고**, normalizeSighting은 옛 백업의 세 값을 남긴다 —
   * 옛 백업에서 온 기록은 이름을 고쳐도 카드에 옛 도장이 남아, 볼 때 계산하는 상세의 보호종 줄과 다른 말을 할 수 있다.
   * 카드에 도장을 찍을지 정하면 카드도 볼 때 계산으로 바꾼다. 키와 타입은 옛 백업 호환으로 그대로.
   */
  stamps: Stamp[]
  /**
   * 위치 숨기기 — 카드(화면·이미지·영상)에 장소 대신 "위치 비공개"를 적고 지도에 올리지 않는다. 사용자가 기록마다 켠다
   * (records/HideLocationSwitch — 둥지처럼 알려지면 안 되는 곳). 기록 상세·목록·백업에는 장소가 그대로 남는다.
   * 키 이름은 보호종 자료로 켜려던 때의 것이다 — 백업 호환 때문에 그대로 둔다.
   */
  sensitive: boolean
  identify: IdentifyStatus
  /** AI의 이름을 그대로 받아들였을 때만 남긴다 */
  verdict?: Verdict
  /**
   * 지금 이름(`speciesKo`)이 이 기록에 붙은 시각 (UTC ISO). 도감 번호의 순서를 정한다 (dex/dexNo.ts).
   * 이름을 바꾸면 새 시각, 이름이 그대로면 그대로, 이름을 비우면 없다. 옛 기록에는 없다 — 그때는 `createdAt`을 쓴다.
   */
  namedAt?: string
  /**
   * 쓰지 않는다 (옛 기록·옛 백업 호환). 도감 번호는 저장하지 않고 볼 때 계산한다 (dex/dexNo.ts dexNumbers, 작업 29) —
   * 기기마다 따로 매겨 저장하면 드라이브·백업으로 합칠 때 번호가 겹친다. 이 값을 다시 읽거나 쓰지 말 것.
   */
  dexNo?: number
  fromSound: boolean
  /**
   * 본 개체 수 — 1~999,999의 정수 (lib/count.ts). 키가 없으면 '세지 않음'이다 — 옛 기록에 1을 채우지 않는다.
   * 어림·범위는 메모에 적는다. 기록 상세와 일지 목록에 보이고, 카드에는 적지 않는다 (카드 디자인은 하나로 고정).
   */
  count?: number
  /**
   * 사진 없이 남긴 기록 (망원경으로만 본 새 — record/QuickRecord). 키가 없으면 사진이 있는 기록이다. 사진 없는 기록만 true로 둔다.
   * 사진이 있어야 하는 기록인지는 이 칸을 직접 보지 말고 `data/photoKey.ts expectsPhoto`에 묻는다 — 소리 기록(`fromSound`)도 사진이 없다.
   */
  noPhoto?: boolean
}

/** 사진 한 장의 세 가지 판. 'crop'은 잘라낸 적이 있을 때만 있다 */
export type PhotoKind = 'full' | 'thumb' | 'crop'
