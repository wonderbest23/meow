/**
 * 한국표준산업분류(KSIC 11차) 조회·검색과 사업 구조 기본값.
 *
 * 데이터: data/ksic/ksic-2025.json (scripts/build-ksic.ts가 공공데이터포털 원본 CSV에서 생성).
 * 원칙: AI 호출 0회. 사업 설명 → 후보 업종은 규칙(동의어 사전 + 이름 토큰)으로만 추천하고 사용자가 확정한다.
 * 이용 조건은 data/ksic/README.md를 따른다(운영 배포 전 확인 필수).
 */
import index from "../../data/ksic/ksic-2025.json";
import type { ProposalSector } from "./proposal-blueprint";

export type KsicLevel = 1 | 2 | 3 | 4 | 5;
export type KsicEntry = { code: string; name: string; level: KsicLevel; parent: string | null };
export const KSIC_LEVEL_LABELS: Record<KsicLevel, string> = { 1: "대분류", 2: "중분류", 3: "소분류", 4: "세분류", 5: "세세분류" };
export const KSIC_ATTRIBUTION = "출처: 국가데이터처 국가데이터연구원, 한국표준산업분류(KSIC) 11차 / 공공데이터포털";

import { type BusinessStructure } from "./business-structure";
export { STRUCTURE_LABELS, structureSummary, revenueBasis, capacityUnitOrder, licenseHint, structureFieldLabels, SECTOR_DEFAULT_STRUCTURE, STRUCTURE_AXES, type BusinessStructure } from "./business-structure";

const S = (sector: ProposalSector, payer: BusinessStructure["payer"], offering: BusinessStructure["offering"], revenue: BusinessStructure["revenue"], delivery: BusinessStructure["delivery"], capital: BusinessStructure["capital"], license: BusinessStructure["license"], smallBusiness: boolean): BusinessStructure => ({ sector, payer, offering, revenue, delivery, capital, license, smallBusiness });

/** 중분류 77개의 사업 구조 기본값. 코드 → 구조. 검수 필요 항목은 테스트가 커버리지를 강제한다. */
export const KSIC_DIVISION_STRUCTURES: Record<string, BusinessStructure> = {
  "01": S("general", "mixed", "goods", "per_unit", "production", "equipment", "varies", true),
  "02": S("general", "b2b", "goods", "per_unit", "production", "equipment", "varies", false),
  "03": S("general", "mixed", "goods", "per_unit", "production", "equipment", "permit", false),
  "05": S("general", "b2b", "goods", "per_unit", "production", "equipment", "permit", false),
  "06": S("general", "b2b", "goods", "per_unit", "production", "equipment", "permit", false),
  "07": S("general", "b2b", "goods", "per_unit", "production", "equipment", "permit", false),
  "08": S("general", "b2b", "service", "project", "visit", "equipment", "permit", false),
  "10": S("manufacturing", "mixed", "goods", "per_unit", "production", "equipment", "registration", true),
  "11": S("manufacturing", "mixed", "goods", "per_unit", "production", "equipment", "varies", true),
  "12": S("manufacturing", "b2b", "goods", "per_unit", "production", "equipment", "permit", false),
  "13": S("manufacturing", "b2b", "goods", "per_unit", "production", "equipment", "none", true),
  "14": S("manufacturing", "mixed", "goods", "per_unit", "production", "equipment", "none", true),
  "15": S("manufacturing", "mixed", "goods", "per_unit", "production", "equipment", "none", true),
  "16": S("manufacturing", "b2b", "goods", "per_unit", "production", "equipment", "varies", true),
  "17": S("manufacturing", "b2b", "goods", "per_unit", "production", "equipment", "none", false),
  "18": S("manufacturing", "b2b", "goods", "project", "production", "equipment", "none", true),
  "19": S("manufacturing", "b2b", "goods", "per_unit", "production", "equipment", "registration", false),
  "20": S("manufacturing", "b2b", "goods", "per_unit", "production", "equipment", "varies", false),
  "21": S("manufacturing", "b2b", "goods", "per_unit", "production", "equipment", "permit", false),
  "22": S("manufacturing", "b2b", "goods", "per_unit", "production", "equipment", "none", true),
  "23": S("manufacturing", "b2b", "goods", "per_unit", "production", "equipment", "none", false),
  "24": S("manufacturing", "b2b", "goods", "per_unit", "production", "equipment", "none", false),
  "25": S("manufacturing", "b2b", "goods", "project", "production", "equipment", "none", true),
  "26": S("manufacturing", "b2b", "goods", "per_unit", "production", "equipment", "none", false),
  "27": S("manufacturing", "b2b", "goods", "per_unit", "production", "equipment", "varies", false),
  "28": S("manufacturing", "b2b", "goods", "per_unit", "production", "equipment", "none", false),
  "29": S("manufacturing", "b2b", "goods", "project", "production", "equipment", "none", true),
  "30": S("manufacturing", "b2b", "goods", "per_unit", "production", "equipment", "varies", false),
  "31": S("manufacturing", "b2b", "goods", "per_unit", "production", "equipment", "varies", false),
  "32": S("manufacturing", "mixed", "goods", "project", "production", "equipment", "none", true),
  "33": S("manufacturing", "mixed", "goods", "per_unit", "production", "equipment", "none", true),
  "34": S("b2b_service", "b2b", "service", "project", "visit", "equipment", "none", true),
  "35": S("general", "mixed", "service", "subscription", "production", "equipment", "permit", false),
  "36": S("general", "mixed", "service", "subscription", "production", "equipment", "permit", false),
  "37": S("general", "b2b", "service", "project", "visit", "equipment", "permit", false),
  "38": S("local_service", "b2b", "service", "per_unit", "visit", "vehicle", "permit", true),
  "39": S("b2b_service", "b2b", "service", "project", "visit", "equipment", "registration", false),
  "41": S("general", "mixed", "service", "project", "visit", "equipment", "registration", false), // 종합건설업 등록(건설산업기본법 9조)
  "42": S("local_service", "mixed", "service", "project", "visit", "equipment", "registration", true),
  "45": S("retail_commerce", "b2c", "goods", "per_unit", "store", "storefront", "none", true),
  "46": S("retail_commerce", "b2b", "goods", "per_unit", "delivery", "equipment", "varies", true),
  "47": S("retail_commerce", "b2c", "goods", "per_unit", "store", "storefront", "varies", true),
  "49": S("logistics", "mixed", "service", "per_unit", "delivery", "vehicle", "permit", true),
  "50": S("logistics", "b2b", "service", "per_unit", "delivery", "vehicle", "varies", false),
  "51": S("logistics", "b2b", "service", "per_unit", "delivery", "vehicle", "permit", false),
  "52": S("logistics", "b2b", "service", "per_unit", "delivery", "equipment", "registration", true),
  "55": S("space_hospitality", "b2c", "space", "rental", "store", "storefront", "registration", true),
  "56": S("food_beverage", "b2c", "goods", "per_unit", "store", "storefront", "registration", true),
  "58": S("software", "mixed", "software", "subscription", "online", "remote", "varies", true),
  "59": S("content_media", "mixed", "content", "project", "online", "equipment", "varies", true),
  "60": S("content_media", "b2b", "content", "mixed", "online", "equipment", "varies", false),
  "61": S("general", "b2c", "service", "subscription", "online", "equipment", "registration", false),
  "62": S("software", "b2b", "software", "project", "online", "remote", "none", true),
  "63": S("software", "mixed", "software", "mixed", "online", "remote", "none", true),
  "64": S("general", "b2c", "service", "commission", "online", "remote", "permit", false),
  "65": S("general", "b2c", "service", "subscription", "online", "remote", "permit", false),
  "66": S("b2b_service", "mixed", "service", "commission", "visit", "remote", "registration", true),
  "68": S("space_hospitality", "mixed", "service", "commission", "store", "storefront", "registration", true),
  "70": S("b2b_service", "b2b", "service", "project", "online", "remote", "none", false),
  "71": S("b2b_service", "b2b", "service", "project", "online", "remote", "professional", true),
  "72": S("b2b_service", "b2b", "service", "project", "visit", "remote", "professional", true),
  "73": S("content_media", "mixed", "service", "project", "mixed", "remote", "varies", true),
  "74": S("local_service", "b2b", "service", "mixed", "visit", "equipment", "registration", true),
  "75": S("b2b_service", "b2b", "service", "project", "online", "remote", "varies", true),
  "76": S("general", "b2c", "goods", "rental", "store", "equipment", "varies", true),
  "84": S("general", "b2g", "service", "project", "visit", "remote", "none", false),
  "85": S("education", "b2c", "service", "subscription", "store", "storefront", "registration", true),
  "86": S("general", "b2c", "service", "per_unit", "store", "storefront", "professional", true),
  "87": S("local_service", "mixed", "service", "subscription", "store", "storefront", "varies", true),
  "90": S("content_media", "b2c", "content", "per_unit", "mixed", "remote", "varies", true),
  "91": S("space_hospitality", "b2c", "space", "mixed", "store", "storefront", "registration", true),
  "94": S("general", "b2c", "service", "subscription", "mixed", "remote", "varies", false),
  "95": S("local_service", "b2c", "service", "per_unit", "store", "equipment", "varies", true),
  "96": S("local_service", "b2c", "service", "per_unit", "store", "storefront", "registration", true),
  "97": S("general", "b2c", "service", "per_hour", "visit", "remote", "none", false),
  "98": S("general", "b2c", "goods", "per_unit", "production", "remote", "none", false),
  "99": S("general", "b2g", "service", "project", "visit", "remote", "none", false),
};

/** 소분류·세세분류 단위로 중분류 기본값을 덮어쓰는 예외(공식 이름과 실제 창업 형태가 다른 곳). */
export const KSIC_STRUCTURE_OVERRIDES: Record<string, Partial<BusinessStructure>> = {
  "5822": { sector: "software", offering: "software", revenue: "subscription", license: "none" },   // 소프트웨어 개발·공급(출판업 아래)
  "5811": { sector: "content_media", offering: "content", revenue: "per_unit", license: "registration" },
  "639": { sector: "content_media", offering: "content", revenue: "mixed", license: "varies" },
  "63120": { sector: "software", offering: "software", revenue: "commission", license: "varies" },
  "731": { sector: "local_service", payer: "b2c", offering: "service", revenue: "per_unit", delivery: "store", capital: "storefront", license: "professional" }, // 수의업(동물병원은 진료 공간 필요)
  "732": { sector: "content_media", payer: "b2b", offering: "service", revenue: "project", delivery: "online", license: "none" }, // 전문 디자인(인허가 없음)
  "733": { sector: "content_media", offering: "content", revenue: "project", delivery: "mixed", license: "none" },
  "739": { sector: "b2b_service", offering: "service", revenue: "project", delivery: "online", license: "none" },
  "6822": { sector: "local_service", revenue: "commission", license: "professional" },              // 부동산 중개
  "6811": { sector: "space_hospitality", offering: "space", revenue: "rental", license: "none" },  // 건물 임대(공유오피스 포함)
  "4791": { delivery: "online", capital: "remote", license: "registration" },                       // 전자상거래 소매(통신판매업 신고)
  "4799": { delivery: "mixed", capital: "remote", license: "registration" },
  "7521": { sector: "b2b_service", payer: "b2c", revenue: "commission", license: "registration" },  // 여행사
  "75995": { sector: "b2b_service", revenue: "project", delivery: "online", license: "none" },       // 온라인 마케팅
  "9021": { sector: "space_hospitality", offering: "space", revenue: "subscription", license: "varies" }, // 독서실·스터디
  "9122": { revenue: "per_hour", license: "registration" },                                           // 게임방·노래연습장
  "9113": { revenue: "subscription", license: "registration" },                                       // 체력단련장 등
  "5621": { license: "permit" },                                                                      // 유흥·단란주점은 허가
  "9611": { revenue: "per_unit", license: "professional" },                                           // 이용·미용(공중위생영업 신고)
  "9691": { revenue: "per_unit", license: "registration" },                                           // 세탁(공중위생영업 신고)
  "8550": { revenue: "subscription", license: "registration" }, "8562": { revenue: "subscription", license: "registration" }, "8563": { revenue: "subscription", license: "registration" },
  "85503": { delivery: "online", capital: "remote" },
  "494": { revenue: "per_unit", capital: "vehicle", license: "permit" },                       // 택배·늘찬배달(퀵)
  "87210": { payer: "mixed", revenue: "subscription", license: "permit" },
  // ── 2026-09-16 소분류 234개 검수 반영. 중분류 기본값이 틀리게 상속되는 곳만 고친다. 근거는 각 줄 주석. ──
  // 음식점·주점
  "56213": { license: "registration" },                                                             // 생맥주·호프는 일반음식점 신고(유흥주점 허가 아님)
  "56219": { license: "registration" },                                                             // 소주방·포차 등 기타 주점도 일반음식점 신고
  "5613": { payer: "b2b", delivery: "visit", capital: "equipment", smallBusiness: false },           // 기관 구내식당(위탁급식)은 기관 계약·시설 내 운영
  "56141": { payer: "mixed", revenue: "project", delivery: "visit", capital: "equipment" },          // 출장 음식(케이터링)은 행사 단위 계약
  "56142": { delivery: "visit", capital: "vehicle" },                                                // 푸드트럭은 차량이 자본
  "56199": { delivery: "delivery" },                                                                 // 포장·배달 전문점
  // 소매
  "4711": { license: "registration", smallBusiness: false },                                        // 백화점·대형마트는 대규모점포 등록
  "4512": { smallBusiness: false, license: "registration" },                                                                  // 중고차 매매업 등록에 전시장·사무실 요건
  "47223": { license: "registration" },                                                              // 반찬 조리·판매는 즉석판매제조·가공업 신고
  "47212": { license: "registration" },                                                              // 정육점은 식육판매업 신고
  "473": { license: "none" }, "474": { license: "none" }, "475": { license: "none" }, "476": { license: "none" }, // 가전·의류·생활용품·문화용품 소매는 인허가 없음
  "47822": { license: "professional" },                                                              // 안경업소는 안경사 면허
  "47852": { license: "varies" },                                                                    // 동물 판매 시 동물판매업 허가, 용품만이면 없음
  "47911": { payer: "mixed", offering: "service", revenue: "commission" },                            // 오픈마켓·중개 플랫폼은 판매자 수수료
  "4792": { delivery: "visit", capital: "vehicle" },                                                 // 노점·이동 소매
  // 운송·물류
  "49402": { license: "none" },                                                                      // 이륜차 퀵·배달대행은 별도 인허가 없음(494 등록은 택배)
  "52992": { revenue: "commission", capital: "remote", license: "varies" },                          // 운송주선은 수수료, 화물주선 허가·국제물류주선 등록으로 갈림
  // 출판·영상·정보
  "5821": { revenue: "mixed", license: "registration" },                                             // 게임제작업·배급업 등록(게임산업법)
  "5911": { license: "varies" },                                                                     // 영화업·비디오물제작업 신고 대상과 온라인 전용 콘텐츠가 갈림
  "5914": { payer: "b2c", offering: "service", revenue: "per_unit", delivery: "store", capital: "storefront", license: "registration" }, // 영화관·감상실
  // 금융·부동산
  "6620": { license: "professional" },                                                               // 보험대리점 등록은 자격시험 합격 전제
  "6821": { payer: "b2b", revenue: "subscription", delivery: "visit" },                              // 건물·주택 관리는 월 위탁계약
  // 전문·과학·기술
  "713": { revenue: "project", license: "none" },                                                    // 광고대행·제작은 인허가 없음
  "71391": { license: "registration" },                                                              // 옥외광고사업 등록
  "714": { license: "none" },                                                                        // 시장조사
  "7153": { license: "none" },                                                                       // 경영컨설팅·PR
  "73901": { sector: "content_media", revenue: "commission", license: "registration" },              // 연예 매니지먼트는 대중문화예술기획업 등록
  "73902": { payer: "mixed", revenue: "per_unit" },                                                  // 번역·통역은 분량·건당 보수
  "743": { license: "none" },                                                                        // 조경 유지관리(시공은 별도)
  // 사업 지원 서비스
  "7511": { revenue: "commission", license: "registration" },                                        // 유료직업소개 등록
  "7531": { revenue: "subscription", delivery: "visit", license: "permit", smallBusiness: false },   // 경비업 허가(자본금 요건)
  "75992": { license: "none" },                                                                      // 행사·이벤트 대행
  "7611": { capital: "vehicle", license: "registration", smallBusiness: false },                     // 렌터카는 자동차대여사업 등록
  // 교육
  "851": { license: "permit", smallBusiness: false }, "852": { license: "permit", smallBusiness: false }, "853": { license: "permit", smallBusiness: false }, "854": { license: "permit", smallBusiness: false }, // 학교 설립 인가
  "85502": { delivery: "visit", capital: "remote" },                                                 // 학습지·방문교육
  "8561": { revenue: "subscription" },                                                               // 태권도장·수영강습 월 회비
  "857": { payer: "mixed", revenue: "per_unit", delivery: "mixed", capital: "remote", license: "varies" }, // 유학원·입시상담·교육컨설팅
  // 보건·복지
  "861": { smallBusiness: false },                                                                   // 병원급은 개설 허가, 소규모 창업 아님
  "871": { license: "registration" },                                                                // 요양원 등 거주 복지시설 설치 신고
  "87293": { delivery: "visit", capital: "remote", license: "registration" },                        // 방문요양·재가센터
  // 예술·스포츠·여가
  "9013": { payer: "mixed", license: "none" },                                                       // 프리랜서 예술가
  "91134": { revenue: "per_unit", license: "none" }, "91135": { revenue: "per_hour" },                                // 볼링장 게임당, 당구장 시간당(9113 구독 상속 오류)
  "91229": { revenue: "per_unit", license: "varies" },                                               // 키즈카페·방탈출: 기타테마파크업 신고(관광진흥법 제5조④) 또는 자유업
  "91231": { license: "varies" },                                                                    // 낚시터업 허가
  // 수리·개인 서비스
  "951": { license: "none" },                                                                        // 컴퓨터·휴대폰 수리
  "9521": { license: "registration" }, "95213": { license: "registration" },                                 // 자동차정비업 등록, 세차업은 대상 아님
  "953": { license: "none" },                                                                        // 가전·의류·신발·시계 수리
  "96122": { license: "professional" },                                                                    // 안마원은 안마사 자격, 스포츠·타이마사지는 법적 지위가 갈림
  "96992": { delivery: "mixed", capital: "remote", license: "none" },                                // 점술·타로
  "96993": { revenue: "per_hour", delivery: "visit", capital: "remote", license: "none" },           // 개인 간병
  "96994": { revenue: "commission", delivery: "mixed", capital: "remote" },                          // 결혼중개(신고는 기본값 유지)
  "96995": { license: "varies" },                                                                    // 동물장묘업 허가, 위탁관리업 등록
  // 제조
  "101": { license: "permit" },                                                                      // 도축·식육가공·식육포장처리는 허가(축산물위생관리법 22조)
  "111": { license: "permit" },                                                                      // 주류 제조면허(주류 면허 등에 관한 법률 제3조)
  "181": { payer: "mixed", license: "registration" },                                                // 인쇄사 신고, 명함·청첩장 등 개인 고객
  "2042": { payer: "mixed", license: "registration", smallBusiness: true },                          // 화장품제조업·책임판매업 등록, 소규모 브랜드 흔함
  "3391": { payer: "b2b", revenue: "project", license: "registration" },                             // 간판은 옥외광고사업 등록, 건별 시공
  // ── 2026-09-17 법령 검수 반영(근거 조문은 docs/ksic-license-review-2026-09-17.md). 중분류 값을 잘못 상속하던 분류를 새로 고정한다. ──
  "91139": { license: "none" },                                                                     // 요가·필라테스 등은 체육시설법 제10조 신고업종이 아닌 자유업
  "96991": { license: "none" },                                                                     // 예식장업은 자유업
  "271": { license: "permit" },                                                                     // 의료기기 제조업 허가(의료기기법 제6조). 27의 시계·광학은 인허가 없음
  "47222": { license: "registration" },                                                             // 건강기능식품 판매업 신고(건강기능식품법 제6조)
  "63992": { license: "registration", smallBusiness: false },                                       // 가상자산사업자 신고(특정금융정보법 제7조), 소규모 창업 아님
  "9111": { smallBusiness: false }, "9112": { smallBusiness: false },                               // 경기장·골프장·스키장은 등록 체육시설(체육시설법 제19조)
  "59141": { smallBusiness: false },                                                                // 영화관
  "55101": { smallBusiness: false }, "55103": { smallBusiness: false },                             // 호텔·콘도
  "35114": { smallBusiness: true },                                                                 // 태양력 발전업은 소규모 창업이 흔하다(35 기본값은 false)
};

/**
 * 구어 표현 → 세세분류 코드. 공식 이름에 없는 말(카페, 네일, 퀵, 펜션, 헬스장, 스마트스토어…)을 잇는다.
 * 코드는 data/ksic/ksic-2025.json에 존재해야 하며 테스트가 이를 검증한다.
 */
export const KSIC_SYNONYMS: Record<string, string[]> = {
  "부품가공": ["25924", "25929"], "부품": ["25929", "25924"], "금속가공": ["25929", "25924"], "절삭": ["25924"], "도금": ["25922"], "용접": ["25929"],
  "카페": ["56221"], "커피": ["56221"], "커피숍": ["56221"], "디저트카페": ["56221", "56150"], "베이커리": ["56150", "10602"], "빵집": ["56150"], "제과점": ["56150"], "떡집": ["10601"],
  "음료": ["56229"], "주스": ["56229"], "차음료": ["56229"], "밀크티": ["56229"],
  "한식": ["56111"], "식당": ["56111"], "밥집": ["56111"], "국수": ["56112"], "칼국수": ["56112"], "고깃집": ["56113"], "삼겹살": ["56113"], "횟집": ["56114"], "해산물": ["56114"],
  "중식": ["56121"], "중국집": ["56121"], "치킨": ["56162"], "피자": ["56161"], "햄버거": ["56161"], "샌드위치": ["56161"], "분식": ["56191"], "김밥": ["56191"], "떡볶이": ["56191"], "포장전문": ["56199"], "배달전문": ["56199"],
  "술집": ["5621"], "주점": ["5621"], "맥주집": ["56213"], "생맥주": ["56213"], "포차": ["5621"],
  "반찬가게": ["47223"], "반찬": ["47223"], "도시락": ["10701", "56199"], "밀키트": ["10701"],
  "편의점": ["47122"], "슈퍼": ["47121"], "마트": ["47121"], "정육점": ["47212"], "과일가게": ["47215"], "채소": ["47215"], "건강식품": ["47222"],
  "화장품": ["47813"], "안경": ["47822"], "안경원": ["47822"], "문구": ["47612"], "문구점": ["47612"], "옷가게": ["47419"], "의류": ["47419"], "신발": ["47430"], "가구": ["47520"], "중고가구": ["47861"],
  "꽃집": ["47851"], "플라워": ["47851"], "화훼": ["47851"], "반려용품": ["47852"], "펫샵": ["47852"], "운동용품": ["47631"], "자전거": ["47632"], "골동품": ["47841"],
  "쇼핑몰": ["47912"], "온라인쇼핑몰": ["47912"], "스마트스토어": ["47912"], "전자상거래": ["47912"], "온라인판매": ["47912"], "오픈마켓": ["47911"], "중개플랫폼": ["47911"], "통신판매": ["47919"], "방문판매": ["47993"], "무점포": ["47999"],
  "택배": ["49401"], "배달": ["49402"], "배달대행": ["49402"], "퀵": ["49402"], "퀵서비스": ["49402"], "물류대행": ["52992"], "운송주선": ["52992"], "창고": ["52101"], "보관": ["52109"],
  "숙박": ["55109"], "게스트하우스": ["55109"], "호스텔": ["55109"], "펜션": ["55104"], "민박": ["55104"],
  "앱": ["58222"], "어플": ["58222"], "소프트웨어": ["58222"], "saas": ["58222"], "게임": ["58212"], "모바일게임": ["58212"], "온라인게임": ["58211"], "개발외주": ["62010"], "프로그래밍": ["62010"], "시스템개발": ["62010"], "플랫폼": ["63120"], "포털": ["63120"], "데이터": ["63991"],
  "출판": ["58113"], "책": ["58113"], "웹툰": ["58112"], "만화": ["58112"], "영상제작": ["59111"], "유튜브": ["59111", "63999"], "크리에이터": ["63999", "90131"],
  "광고대행": ["71310"], "광고": ["71310"], "마케팅": ["75995"], "sns마케팅": ["75995"], "온라인마케팅": ["75995"], "시장조사": ["71400"], "컨설팅": ["71531"], "경영컨설팅": ["71531"], "세무": ["71202"], "세무사": ["71202"], "회계": ["71201"], "법무사": ["71103"],
  "번역": ["73902"], "통역": ["73902"], "인테리어디자인": ["73201"], "인테리어": ["73201", "42"], "제품디자인": ["73202"], "디자인": ["73201", "73202"], "사진": ["73301"], "촬영": ["73301"], "스튜디오": ["73301"], "상업사진": ["73302"], "건축설계": ["72111"],
  "청소": ["74211"], "청소업": ["74211"], "조경": ["74300"], "경비": ["75310"], "인력파견": ["75121"], "콜센터": ["75991"], "행사대행": ["75992"], "이벤트": ["75992"], "여행사": ["75210"],
  "학원": ["85501"], "교습소": ["85632"], "과외": ["85632"], "온라인교육": ["85503"], "인강": ["85503"], "음악학원": ["85621"], "피아노": ["85621"], "미술학원": ["85622"], "영어학원": ["85631"], "영어": ["85631"], "영어과외": ["85631", "85632"], "외국어": ["85631"], "온라인과외": ["85503"], "온라인수업": ["85503"], "온라인강의": ["85503"], "화상수업": ["85503"], "직업훈련": ["85669"], "코딩교육": ["85632"],
  "의원": ["86201"], "치과": ["86202"], "한의원": ["86203"], "어린이집": ["87210"], "보육": ["87210"], "요양원": ["87111"], "요양": ["87111"],
  "공연": ["90131"], "예술가": ["90132"], "독서실": ["90212"], "스터디카페": ["90212"], "영화관": ["59141"],
  "헬스장": ["91132"], "피트니스": ["91132"], "요가": ["91139"], "필라테스": ["91139"], "수영장": ["91133"], "볼링장": ["91134"], "당구장": ["91135"], "골프연습장": ["91136"], "스크린골프": ["91136"], "골프장": ["91121"], "낚시터": ["91231"], "노래방": ["91223"], "코인노래방": ["91223"], "pc방": ["91222"], "피시방": ["91222"], "게임방": ["91222"], "키즈카페": ["91229"], "방탈출": ["91229"], "스포츠클럽": ["91191"],
  "미용실": ["96112"], "헤어": ["96112"], "헤어샵": ["96112"], "이발소": ["96111"], "바버샵": ["96111"], "피부관리": ["96113"], "에스테틱": ["96113"], "네일": ["96119"], "네일샵": ["96119"], "네일아트": ["96119"], "왁싱": ["96119"], "속눈썹": ["96119"], "마사지": ["96122"], "목욕탕": ["96121"], "세탁소": ["96912"], "세탁": ["96912"],
  "장례": ["96921"], "웨딩": ["96994"], "결혼상담": ["96994"], "간병": ["96993"], "펫장례": ["96995"], "반려동물": ["96995", "47852", "73100"], "동물병원": ["73100"], "수의사": ["73100"],
  "부동산": ["68221"], "공인중개사": ["68221"], "부동산중개": ["68221"], "공유오피스": ["68112"], "사무실임대": ["68112"], "임대": ["68119"], "렌터카": ["76110"], "자동차임대": ["76110"],
  "세차": ["95213"], "세차장": ["95213"], "자동차수리": ["9521"], "정비소": ["9521"], "카센터": ["9521"],
  "인쇄": ["18111"], "인쇄소": ["18111"], "금형": ["29293"], "가방": ["15129"], "액세서리": ["33120"], "귀금속": ["33110"], "화장품제조": ["20423"], "아이스크림": ["10422"], "아이스크림가게": ["47229"], "아이스크림할인점": ["47229"], "아이스크림전문점": ["56229"], "커피로스팅": ["10891"], "로스터리": ["10891", "56221"],
  "전기공사": ["42311"], "농업": ["01"], "스마트팜": ["01151"],
  "이사": ["49302", "49309"], "이사업체": ["49302", "49309"], "용달": ["49302"], "화물운송": ["49301"], "트럭": ["49301"],
  "심부름": ["96999", "75999"], "심부름대행": ["96999", "75999"], "생활서비스": ["96999"], "반려동물산책": ["96995"], "펫시터": ["96995"], "펫시팅": ["96995"], "캠핑장": ["55105"], "캠핑": ["55105"], "글램핑": ["55105"], "야영장": ["55105"],
  "요가스튜디오": ["91139"], "필라테스스튜디오": ["91139"], "중고명품": ["47869"], "중고의류": ["47869"], "리셀": ["47869"], "무인": ["47991", "47229"], "무인점포": ["47991", "47229"], "무인가게": ["47991", "47229"], "드론촬영": ["73301"],
};

let cache: { entries: KsicEntry[]; byCode: Map<string, KsicEntry>; children: Map<string, KsicEntry[]>; normalized: Map<string, string> } | null = null;
function data() {
  if (cache) return cache;
  const entries = (index as { entries: KsicEntry[] }).entries;
  const byCode = new Map(entries.map(e => [e.code, e]));
  const children = new Map<string, KsicEntry[]>();
  for (const e of entries) if (e.parent) { const list = children.get(e.parent) ?? []; list.push(e); children.set(e.parent, list); }
  const normalized = new Map(entries.map(e => [e.code, normalize(e.name)]));
  return (cache = { entries, byCode, children, normalized });
}

/** 공식 이름에 흔해 단독으로는 업종을 가리키지 못하는 토큰. 이름 매칭에서 제외한다(동의어 사전은 그대로). */
const NAME_STOPWORDS = new Set(["대행", "서비스", "서비스업", "운영", "운영업", "관련", "기타", "판매", "판매업", "제조", "제조업", "도매", "도매업", "소매", "소매업", "일반", "전문", "사업", "산업", "활동", "시설", "그외", "달리", "분류", "전문점", "가게", "매장", "상점", "회사", "업체", "창업", "사업체", "온라인", "오프라인", "운영중", "하고싶어요", "하려고"].map(word => word.normalize("NFKC")));

export function normalize(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/[\s·,.;:()~/\-]+/g, "");
}

export function ksicEntries(level?: KsicLevel): KsicEntry[] {
  const all = data().entries;
  return level ? all.filter(e => e.level === level) : all;
}
export function ksicByCode(code: string): KsicEntry | undefined { return data().byCode.get(code); }
export function ksicChildren(code: string): KsicEntry[] { return data().children.get(code) ?? []; }
/** 대분류부터 부모까지, 위에서 아래 순서 */
export function ksicAncestors(code: string): KsicEntry[] {
  const out: KsicEntry[] = []; let cur = ksicByCode(code)?.parent;
  while (cur) { const e = ksicByCode(cur); if (!e) break; out.unshift(e); cur = e.parent; }
  return out;
}
export function ksicDivision(code: string): KsicEntry | undefined {
  const e = ksicByCode(code); if (!e) return undefined;
  return e.level === 2 ? e : ksicAncestors(code).find(a => a.level === 2);
}
export function ksicPath(code: string): string {
  return [...ksicAncestors(code), ksicByCode(code)].filter(Boolean).map(e => e!.name).join(" › ");
}

/** 세세분류 → 중분류 기본값에 소분류/세분류/세세분류 예외를 얹은 사업 구조 */
export function ksicStructure(code: string): BusinessStructure | undefined {
  const division = ksicDivision(code); if (!division) return undefined;
  const base = KSIC_DIVISION_STRUCTURES[division.code]; if (!base) return undefined;
  const chain = [...ksicAncestors(code).map(e => e.code), code].filter(c => c.length >= 2);
  return chain.reduce<BusinessStructure>((acc, c) => ({ ...acc, ...(KSIC_STRUCTURE_OVERRIDES[c] ?? {}) }), { ...base });
}

export type KsicMatch = { entry: KsicEntry; score: number; via: "synonym" | "name" };

/**
 * 사업 설명에서 업종 후보를 찾는다. 동의어 사전 → 이름 토큰 포함 순으로 점수를 매기고 세세분류를 우선한다.
 * 결정이 아니라 추천이다. 부정·복합 표현의 판단은 호출자가 한다.
 */
export function searchKsic(text: string, options: { limit?: number; minLevel?: KsicLevel } = {}): KsicMatch[] {
  const { limit = 8, minLevel = 3 } = options;
  const q = normalize(text); if (!q) return [];
  const scores = new Map<string, KsicMatch>();
  const add = (code: string, score: number, via: KsicMatch["via"]) => {
    const entry = ksicByCode(code); if (!entry || entry.level < minLevel && via === "name") return;
    const prev = scores.get(code); if (!prev || prev.score < score) scores.set(code, { entry, score, via });
  };
  // 토큰: 문장을 공백·구분자로 나누고 조사·어미를 떼어 낸다. 짧은 동의어 키(2글자 이하)와 이름 매칭에 쓴다.
  const tokens = new Set<string>();
  for (const part of text.normalize("NFKC").split(/[\s,·/()]+/).filter(Boolean)) {
    const n = normalize(part.replace(/(을|를|이|가|은|는|의|로|으로|에서|하고|해서|하는|할|하려고|하고싶어요|하고싶어|해요|입니다|이에요|예요)$/u, ""));
    if (n.length >= 2) tokens.add(n);
  }
  // 1) 동의어: 긴 표현부터. 3글자 이상은 문장 안 포함으로, 2글자 이하는 토큰 전체 일치로만 맞춘다("책"이 "산책"에 걸리지 않게).
  const keys = Object.keys(KSIC_SYNONYMS).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    const k = normalize(key); if (!k) continue;
    // 짧은 키는 토큰이 그 키로 시작하고 두 글자 이내로만 길 때 허용("출판사"←"출판", "퀵배송"←"퀵"은 통과, "산책"←"책"은 제외)
    const hit = k.length >= 3 ? q.includes(k) : q === k || [...tokens].some(t => t === k || (t.startsWith(k) && t.length <= k.length + 2));
    if (hit) for (const code of KSIC_SYNONYMS[key]) add(code, 100 + k.length * 2, "synonym");
  }
  // 2) 이름 토큰: 일반 단어는 제외하고 공식 이름과 대조
  for (const t of [...tokens]) if (NAME_STOPWORDS.has(t)) tokens.delete(t);
  const { entries, normalized } = data();
  for (const e of entries) {
    if (e.level < minLevel) continue;
    const name = normalized.get(e.code)!; let score = 0;
    for (const t of tokens) if (name.includes(t)) score += 10 + Math.min(t.length, 6) * 3;
    if (score) add(e.code, score + e.level, "name");
  }
  return [...scores.values()].sort((a, b) => b.score - a.score || b.entry.level - a.entry.level || a.entry.code.localeCompare(b.entry.code)).slice(0, limit);
}

/** 우리 11업종 → 대표 중분류 코드들(표시·예시·PPT 판형 호환용) */
export const SECTOR_DIVISIONS: Record<ProposalSector, string[]> = {
  b2b_service: ["71", "70", "75", "34", "66"],
  software: ["62", "63", "58"],
  food_beverage: ["56", "10", "11"],
  retail_commerce: ["47", "46", "45"],
  manufacturing: ["13", "14", "15", "16", "18", "22", "25", "29", "32", "33"],
  education: ["85"],
  local_service: ["96", "95", "74", "42", "87", "38"],
  space_hospitality: ["55", "68", "91", "90"],
  logistics: ["49", "52", "50", "51"],
  content_media: ["59", "73", "60"],
  general: ["01", "02", "03", "35", "36", "41", "64", "65", "76", "84", "86", "94", "97", "98", "99"],
};

export function sectorForKsic(code: string): ProposalSector | undefined { return ksicStructure(code)?.sector; }
