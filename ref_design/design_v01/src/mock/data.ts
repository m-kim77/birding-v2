/**
 * 가짜 데이터. 화면 모양을 보기 위한 것이라 값의 정확성은 보장하지 않는다.
 *
 * 사진은 위키미디어 공용의 파일을 주소로만 불러온다 (초안 전용 — 파일마다 라이선스와 저작자가 따로 있으므로
 * 제품이나 공개 자료에 그대로 쓰지 않는다). 못 불러오면 PhotoBox가 자리 표시로 대신한다.
 * Figma 시안이 쓰던 Unsplash 주소는 말·개 사진이 섞여 있어서 버렸다.
 */
import type { DetectBox, Sighting, SoundHit, Verdict } from '../types'

/** 위키미디어 공용 파일 이름 → 폭 960px 주소 */
const W = (file: string) => `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=960`

const PHOTO = {
  duck: W('Anas_zonorhyncha_swimming.jpg'),
  kingfisher: W('Alcedo_atthis_-England-8_(cropped).jpg'),
  kestrel: W('Common_kestrel_falco_tinnunculus.jpg'),
  bulbul: W('The_brown-eared_bulbul_after_playing_with_water.jpg'),
  owl: W('Bubo_bubo_3_(Martin_Mecnarowski).jpg'),
  redstart: W('Daurian_redstart_at_Daisen_Park_in_Osaka,_January_2016.jpg'),
  egret: W('Little_egret_(Egretta_garzetta)_Photograph_by_Shantanu_Kuveskar.jpg'),
}

// 물총새는 일부러 뺐다 — 기록하기 흐름에서 물총새를 저장하면 "첫 만남" 카드 연출이 나온다
export const SIGHTINGS: Sighting[] = [
  { id: 's8', speciesKo: '', latin: '', capturedAt: '2026-09-20T07:12:00', place: '중랑천 하류', lat: 37.553, lng: 127.049,
    locationSource: 'tracklog', exifLine: '600mm · f/6.3 · 1/1600s · ISO 1250', note: '백로류인데 쇠백로인지 중대백로인지 모르겠음. 발 색을 못 봤다.',
    photo: PHOTO.egret, tier: 1, stamps: [], sensitive: false, identify: 'waiting', fromSound: false },
  { id: 's6', speciesKo: '흰뺨검둥오리', latin: 'Anas zonorhyncha', capturedAt: '2026-09-16T08:20:00', place: '탄천', lat: 37.497, lng: 127.071,
    locationSource: 'tracklog', exifLine: '400mm · f/5.6 · 1/1000s · ISO 400', note: '새끼 다섯 마리와 함께.',
    photo: PHOTO.duck, tier: 1, stamps: [], sensitive: false, identify: 'done', fromSound: false },
  { id: 's5', speciesKo: '황조롱이', latin: 'Falco tinnunculus', capturedAt: '2026-09-14T16:05:00', place: '남한산성 서문', lat: 37.478, lng: 127.176,
    locationSource: 'manual', exifLine: '600mm · f/6.3 · 1/3200s · ISO 640', note: '정지 비행 후 급강하.',
    photo: PHOTO.kestrel, tier: 2, stamps: ['천연기념물'], sensitive: false, identify: 'done', fromSound: false },
  { id: 's4', speciesKo: '직박구리', latin: 'Hypsipetes amaurotis', capturedAt: '2026-09-12T09:30:00', place: '올림픽공원', lat: 37.52, lng: 127.121,
    locationSource: 'exif', exifLine: '300mm · f/5.6 · 1/800s · ISO 320', note: '',
    photo: PHOTO.bulbul, tier: 1, stamps: [], sensitive: false, identify: 'none', fromSound: false },
  { id: 's3', speciesKo: '수리부엉이', latin: 'Bubo bubo', capturedAt: '2026-08-30T19:40:00', place: '경기 파주시', lat: null, lng: null,
    locationSource: 'manual', exifLine: '600mm · f/6.3 · 1/250s · ISO 6400', note: '해 진 직후 절벽 위에서 울음소리 먼저 들림.',
    photo: PHOTO.owl, tier: 4, stamps: ['천연기념물', '멸종위기'], sensitive: true, identify: 'done', fromSound: false },
  { id: 's2', speciesKo: '딱새', latin: 'Phoenicurus auroreus', capturedAt: '2026-08-21T07:55:00', place: '서울숲', lat: 37.544, lng: 127.037,
    locationSource: 'gps', exifLine: '', note: '소리로 기록 · 신뢰도 88%',
    photo: '', tier: 1, stamps: [], sensitive: false, identify: 'done', fromSound: true },
  { id: 's1', speciesKo: '딱새', latin: 'Phoenicurus auroreus', capturedAt: '2026-08-10T17:10:00', place: '서울숲', lat: 37.544, lng: 127.037,
    locationSource: 'exif', exifLine: '400mm · f/5.6 · 1/1250s · ISO 200', note: '수컷. 울타리 위에서 꼬리를 떨며 지저귐.',
    photo: PHOTO.redstart, tier: 3, stamps: [], sensitive: false, identify: 'done', fromSound: false },
]

/** 기록하기 화면에서 "방금 고른 사진"으로 쓰는 값 */
export const PICKED_PHOTO = {
  src: PHOTO.kingfisher,
  capturedAt: '2026-09-22T06:48:00',
  place: '청계천 고산자교',
  locationSource: 'tracklog' as const,
  /** 이동 기록으로 추정했을 때 앞뒤 지점과의 시간 차 */
  locationNote: '이동 기록으로 추정 · 앞뒤 2분',
  exifLine: '600mm · f/6.3 · 1/2000s · ISO 800',
}

export const DETECT_BOXES: DetectBox[] = [
  { box: [0.09, 0.05, 0.85, 0.97], score: 0.94 },
]

/** AI 판정이 거치는 단계. v1 birdllm의 루프(관찰 → 후보 → 검색 → 근거 확인)를 말로 옮긴 것 */
export const IDENTIFY_STEPS = [
  '사진에서 특징을 살펴보는 중',
  '후보를 세우는 중 — 물총새, 호반새',
  '자료를 찾는 중 — 위키백과 "물총새"',
  '자료를 찾는 중 — 분포와 서식지',
  '근거를 확인하는 중',
]

export const VERDICT: Verdict = {
  kind: '확정', speciesKo: '물총새', latin: 'Alcedo atthis',
  summary: '등과 머리의 청록색 광택, 주황색 배, 길고 곧은 검은 부리가 물총새와 일치합니다.',
  evidence: [
    { text: '윗면은 광택 있는 청록색, 아랫면은 주황색이며 부리는 길고 뾰족하다.', source: '위키백과 · 물총새' },
    { text: '한국에서는 하천과 저수지에서 흔히 관찰되는 여름철새이며 일부는 월동한다.', source: '위키백과 · 물총새' },
    { text: '호반새는 부리와 몸 전체가 붉은 갈색이라 사진의 개체와 다르다.', source: '위키백과 · 호반새' },
  ],
  others: [],
}

export const SOUND_HITS: SoundHit[] = [
  { speciesKo: '딱새', latin: 'Phoenicurus auroreus', confidence: 0.91, ranges: [[1.5, 4.5], [9, 12]] },
  { speciesKo: '직박구리', latin: 'Hypsipetes amaurotis', confidence: 0.78, ranges: [[5.5, 8]] },
  { speciesKo: '박새', latin: 'Parus minor', confidence: 0.42, ranges: [[12.5, 14]] },
]

/** 소리 분석에 쓰는 가짜 녹음 길이 (초) */
export const SOUND_SECONDS = 15

/** 종 이름 입력의 추천 목록. 전에 본 종이 먼저 나온다 */
export const KNOWN_SPECIES = ['흰뺨검둥오리', '황조롱이', '직박구리', '수리부엉이', '딱새']
export const ALL_SPECIES = [...KNOWN_SPECIES, '물총새', '쇠백로', '물까치', '물닭', '박새', '쇠박새', '곤줄박이', '청둥오리', '왜가리', '중대백로', '호반새', '청호반새']

/** 기기에 받아 두는 모델. 크기는 HANDOFF.md의 후보 모델 기준 어림값 */
export const MODELS = [
  { id: 'detect', name: '새 찾기', sizeMb: 13, purpose: '사진에서 새의 위치를 찾습니다' },
  { id: 'sound', name: '새소리 인식', sizeMb: 48, purpose: '녹음에서 새소리를 구분합니다' },
]
