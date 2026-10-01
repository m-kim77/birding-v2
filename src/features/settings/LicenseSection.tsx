import { PROTECTED_BASIS } from '../../data/protectedSpecies'

/**
 * 오픈소스·모델·자료의 출처. 라이선스가 고지를 요구한다 (Apache-2.0, ODbL 등).
 * 모델이나 자료를 더하거나 바꾸면 여기에도 한 줄을 더한다 — 고지 의무는 배포하는 쪽에 있다.
 * 법령·지정 목록에서 옮긴 보호종 표는 라이선스 자리에 기준일을 적는다 — 목록은 개정되므로 낡은 것이 보여야 한다.
 */
const CREDITS: Array<{ what: string; who: string; license: string }> = [
  { what: '새 찾기 모델 EfficientDet-Lite0 · MediaPipe Tasks', who: 'Google', license: 'Apache-2.0' },
  { what: '지도 자료와 타일', who: '© OpenStreetMap 기여자', license: 'ODbL' },
  { what: '장소 이름 찾기 (Nominatim)', who: 'OpenStreetMap', license: 'ODbL' },
  { what: '판정 근거 자료', who: '위키백과', license: 'CC BY-SA 4.0' },
  { what: '멸종위기 야생생물 목록 (조류)', who: PROTECTED_BASIS.endangered.who, license: PROTECTED_BASIS.endangered.asOf },
  { what: '천연기념물 목록 (조류)', who: PROTECTED_BASIS.monument.who, license: PROTECTED_BASIS.monument.asOf },
  { what: 'Leaflet · React · exifr · fflate', who: '각 저자', license: 'BSD-2 / MIT' },
  { what: '글꼴 Pretendard · Noto Serif KR', who: '길형진 · Google', license: 'SIL OFL 1.1' },
]

/** 접어 둔 출처 목록. 버튼이 아니라 펼침이다 — 다른 화면으로 갈 만큼의 내용이 아니다 */
export default function LicenseSection() {
  return (
    <details className="credits">
      <summary>오픈소스 · 모델 · 자료 출처</summary>
      <ul>{CREDITS.map((c) => <li key={c.what}><strong>{c.what}</strong><small>{c.who} · {c.license}</small></li>)}</ul>
    </details>
  )
}
