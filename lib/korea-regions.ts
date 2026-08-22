/**
 * 대한민국 행정구역(광역 17 + 시·군·구).
 *
 * 지역 입력칸에서 '마포'만 쳐도 '서울특별시 마포구'를 골라 넣을 수 있게
 * 쓰는 목록이다. 통계청 행정구역 분류를 따르고, 검색 편의를 위해
 * 짧은 이름(서울·경기 등)도 함께 넣는다.
 * 읍·면·동까지는 넣지 않는다 — 사업계획서에 필요한 단위는 시·군·구다.
 */
export interface KoreaRegion {
  /** 광역시·도 정식 명칭 */
  sido: string;
  /** 짧은 이름 — 사람들이 실제로 치는 말 */
  sidoShort: string;
  /** 시·군·구 (광역시 자체를 뜻하면 빈 문자열) */
  sigungu: string;
}

const RAW: Record<string, [string, string[]]> = {
  // 정식명: [짧은 이름, 시군구]
  "서울특별시": ["서울", ["종로구","중구","용산구","성동구","광진구","동대문구","중랑구","성북구","강북구","도봉구","노원구","은평구","서대문구","마포구","양천구","강서구","구로구","금천구","영등포구","동작구","관악구","서초구","강남구","송파구","강동구"]],
  "부산광역시": ["부산", ["중구","서구","동구","영도구","부산진구","동래구","남구","북구","해운대구","사하구","금정구","강서구","연제구","수영구","사상구","기장군"]],
  "대구광역시": ["대구", ["중구","동구","서구","남구","북구","수성구","달서구","달성군","군위군"]],
  "인천광역시": ["인천", ["중구","동구","미추홀구","연수구","남동구","부평구","계양구","서구","강화군","옹진군"]],
  "광주광역시": ["광주", ["동구","서구","남구","북구","광산구"]],
  "대전광역시": ["대전", ["동구","중구","서구","유성구","대덕구"]],
  "울산광역시": ["울산", ["중구","남구","동구","북구","울주군"]],
  "세종특별자치시": ["세종", []],
  "경기도": ["경기", ["수원시","성남시","의정부시","안양시","부천시","광명시","평택시","동두천시","안산시","고양시","과천시","구리시","남양주시","오산시","시흥시","군포시","의왕시","하남시","용인시","파주시","이천시","안성시","김포시","화성시","광주시","양주시","포천시","여주시","연천군","가평군","양평군"]],
  "강원특별자치도": ["강원", ["춘천시","원주시","강릉시","동해시","태백시","속초시","삼척시","홍천군","횡성군","영월군","평창군","정선군","철원군","화천군","양구군","인제군","고성군","양양군"]],
  "충청북도": ["충북", ["청주시","충주시","제천시","보은군","옥천군","영동군","증평군","진천군","괴산군","음성군","단양군"]],
  "충청남도": ["충남", ["천안시","공주시","보령시","아산시","서산시","논산시","계룡시","당진시","금산군","부여군","서천군","청양군","홍성군","예산군","태안군"]],
  "전북특별자치도": ["전북", ["전주시","군산시","익산시","정읍시","남원시","김제시","완주군","진안군","무주군","장수군","임실군","순창군","고창군","부안군"]],
  "전라남도": ["전남", ["목포시","여수시","순천시","나주시","광양시","담양군","곡성군","구례군","고흥군","보성군","화순군","장흥군","강진군","해남군","영암군","무안군","함평군","영광군","장성군","완도군","진도군","신안군"]],
  "경상북도": ["경북", ["포항시","경주시","김천시","안동시","구미시","영주시","영천시","상주시","문경시","경산시","의성군","청송군","영양군","영덕군","청도군","고령군","성주군","칠곡군","예천군","봉화군","울진군","울릉군"]],
  "경상남도": ["경남", ["창원시","진주시","통영시","사천시","김해시","밀양시","거제시","양산시","의령군","함안군","창녕군","고성군","남해군","하동군","산청군","함양군","거창군","합천군"]],
  "제주특별자치도": ["제주", ["제주시","서귀포시"]],
};

export const KOREA_REGIONS: KoreaRegion[] = Object.entries(RAW).flatMap(([sido, [sidoShort, list]]) =>
  list.length === 0
    ? [{ sido, sidoShort, sigungu: "" }]
    : [{ sido, sidoShort, sigungu: "" }, ...list.map((sigungu) => ({ sido, sidoShort, sigungu }))],
);

/** 화면에 넣을 문자열 — '서울 마포구' 처럼 짧은 이름으로 */
export function regionLabel(r: KoreaRegion): string {
  return r.sigungu ? `${r.sidoShort} ${r.sigungu}` : r.sidoShort;
}

/**
 * 친 글자로 지역을 찾는다.
 * '마포' → 서울 마포구 / '서울 마' → 서울 마포구 / '경기 수원' → 경기 수원시.
 * 시작 일치를 먼저, 그다음 포함 일치. 광역만 있는 줄은 뒤로 보낸다.
 */
export function searchRegions(input: string, limit = 8): KoreaRegion[] {
  const q = input.trim().replace(/\s+/g, " ");
  if (!q) return [];
  const parts = q.split(" ");
  const scored: Array<{ r: KoreaRegion; score: number }> = [];
  for (const r of KOREA_REGIONS) {
    const label = regionLabel(r);
    const full = `${r.sido} ${r.sigungu}`.trim();
    let score = -1;
    if (parts.length > 1) {
      /* '서울 마' 처럼 광역 + 앞글자 */
      const [a, ...rest] = parts;
      const tail = rest.join(" ");
      const sidoHit = r.sidoShort.startsWith(a) || r.sido.startsWith(a);
      if (sidoHit && r.sigungu.startsWith(tail)) score = 0;
      else if (sidoHit && r.sigungu.includes(tail)) score = 2;
    }
    if (score < 0) {
      if (r.sigungu.startsWith(q)) score = 1;
      else if (label.startsWith(q) || full.startsWith(q)) score = 1;
      else if (r.sigungu.includes(q)) score = 3;
      else if (label.includes(q) || full.includes(q)) score = 4;
    }
    if (score < 0) continue;
    if (!r.sigungu) score += 5; // 광역만 있는 줄은 뒤로
    scored.push({ r, score });
  }
  scored.sort((a, b) => a.score - b.score || regionLabel(a.r).localeCompare(regionLabel(b.r), "ko"));
  return scored.slice(0, limit).map((s) => s.r);
}

/* ── 읍·면·동 → 시·군·구 ───────────────────────────────────────────
 * '성수동'만 쳐도 '서울 성동구'가 나오게. 4,023개라 첫 화면 무게에
 * 얹지 않고, 지역 칸을 실제로 쓸 때만 불러온다(지연 로딩).
 *
 * 출처: 행정표준코드관리시스템 '법정동코드 전체자료'(2026-03 기준).
 */
export interface EmdHit {
  /** 친 동 이름 */
  emd: string;
  region: KoreaRegion;
}

let emdMap: Record<string, string> | null = null;
let emdLoading: Promise<void> | null = null;

/** 동 목록을 준비한다 — 지역 칸에 처음 손댈 때 한 번 */
export function loadEmd(): Promise<void> {
  if (emdMap) return Promise.resolve();
  if (!emdLoading) {
    emdLoading = import("./korea-emd.json")
      .then((m) => { emdMap = (m.default ?? m) as Record<string, string>; })
      .catch(() => { emdMap = {}; });
  }
  return emdLoading;
}

const SIDO_BY_SHORT = new Map(KOREA_REGIONS.filter((r) => !r.sigungu).map((r) => [r.sidoShort, r.sido]));

/** '성수' / '성수동' → 서울 성동구. 아직 안 불러왔으면 빈 결과. */
export function searchEmd(input: string, limit = 6): EmdHit[] {
  const q = input.trim();
  if (!emdMap || q.length < 2) return [];
  const starts: EmdHit[] = [];
  const includes: EmdHit[] = [];
  for (const [emd, packed] of Object.entries(emdMap)) {
    const isStart = emd.startsWith(q);
    if (!isStart && !emd.includes(q)) continue;
    for (const one of packed.split(";")) {
      const [sidoShort, sigungu] = one.split("|");
      const sido = SIDO_BY_SHORT.get(sidoShort) ?? sidoShort;
      const hit: EmdHit = { emd, region: { sido, sidoShort, sigungu } };
      (isStart ? starts : includes).push(hit);
    }
    if (starts.length >= limit) break;
  }
  const all = [...starts, ...includes];
  /*
   * 같은 시·군·구로 가는 줄은 하나만.
   * '성수동' 은 성수동·성수동1가·성수동2가 세 줄이 다 성동구인데,
   * 세 줄을 다 보여 주면 고를 것이 아니라 읽을 것이 된다.
   */
  const seen = new Set<string>();
  const out: EmdHit[] = [];
  for (const h of all) {
    const k = `${h.region.sidoShort}|${h.region.sigungu}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(h);
    if (out.length >= limit) break;
  }
  return out;
}
