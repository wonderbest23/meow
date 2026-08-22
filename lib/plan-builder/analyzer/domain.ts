/*
 * 동적 역질문 — 도메인 타입·태그 사전·검증.
 *
 * 사용자가 사업을 몇 줄 적으면 AI가 구조를 분석(BusinessAnalysis)하고,
 * 그 결과를 기준으로 "정말 부족한 것"만 묻는다. 여기서 지키는 규칙:
 *  - 모든 값은 {value, status}. status 는 confirmed(사용자가 말함) /
 *    inferred(AI 추론, 확인 전) / unknown(모름) 셋뿐이다.
 *  - inferred 는 사용자가 [맞아요]를 누르기 전까지 사실이 아니다.
 *  - 숫자는 AI가 절대 만들지 않는다 — 가격·인원·비용은 전부 unknown 으로 시작한다.
 *  - 태그는 닫힌 사전에서만 고른다. 사전에 없는 값은 버린다.
 *
 * 저장은 plan.answers["__analysis"] 가상 섹션 한 곳 — DB 마이그레이션이 없고,
 * 진행률(blueprint 기준)에 잡히지 않으며, 답변 이어받기에 자연히 포함된다.
 * (선례: FINANCIAL_OVERRIDE_KEY = "financials/__review")
 */
import { z } from "zod";

/** plan.answers 안의 가상 섹션 키 */
export const ANALYSIS_KEY = "__analysis";

export type AnalysisStatus = "confirmed" | "inferred" | "unknown";

export interface AnalysisField<T> {
  value: T | null;
  status: AnalysisStatus;
  confidence?: number;
}

/** 시작 화면의 업종 9종 — 기존 코드가 읽는 값이라 그대로 */
export const PRIMARY_INDUSTRIES = [
  "카페·음식점",
  "온라인 쇼핑몰",
  "오프라인 매장",
  "교육·강의",
  "서비스·용역",
  "제조·생산",
  "IT·앱·웹",
  "콘텐츠·크리에이터",
  "기타",
] as const;

/** 돈을 버는 방식 — 질문팩·재무 산식을 고른다 */
export const MODEL_TAGS = {
  unit_sale: "1회성 판매",
  class: "수업·클래스",
  subscription: "정기 구독",
  commerce: "온라인 판매",
  commission: "중개 수수료",
  service_hour: "시간·건당 용역",
  seat: "좌석형(카페·공간)",
  franchise: "가맹",
  ad_content: "광고·협찬",
} as const;
export type ModelTag = keyof typeof MODEL_TAGS;

/** 운영·전달 방식 */
export const OPERATION_TAGS = {
  offline: "오프라인",
  online: "온라인",
  hybrid: "온·오프라인 병행",
  delivery: "배달·배송",
  visit: "방문·출장",
  b2c: "개인 고객",
  b2b: "기업 고객",
  b2g: "공공기관",
  reservation: "예약제",
  walkin: "방문 즉시 이용",
  inventory: "재고 보유",
  made_to_order: "주문 제작",
  no_inventory: "재고 없음",
  owner_only: "대표 혼자 운영",
  staffed: "직원 고용",
  freelancer: "프리랜서 협업",
  content_led: "콘텐츠·SNS 유입",
  search_led: "검색 유입",
  local_led: "동네·지역 유입",
  referral_led: "소개·입소문",
  ads_led: "광고 유입",
  pet: "반려동물",
  food: "식음료",
  beauty: "뷰티",
  health: "건강·운동",
  edu: "교육",
  kids: "아동",
  senior: "시니어",
  fashion: "패션",
  craft: "공예·수제",
  it: "IT",
  licensed: "인허가 필요",
  personal_data: "개인정보 취급",
  food_safety: "식품 위생",
} as const;
export type OperationTag = keyof typeof OPERATION_TAGS;

export interface BusinessAnalysis {
  primary: AnalysisField<string>;
  modelTags: AnalysisField<ModelTag[]>;
  operationTags: AnalysisField<OperationTag[]>;
  customer: AnalysisField<string>;
  problem: AnalysisField<string>;
  solution: AnalysisField<string>;
  revenueModel: AnalysisField<string>;
  deliveryModel: AnalysisField<string>;
  acquisitionChannels: AnalysisField<string[]>;
  keyCosts: AnalysisField<string[]>;
  stage: AnalysisField<string>;
  region: AnalysisField<string>;
  gapHints: Array<{ slot: string; why: string }>;
  summaryForUser: string;
}

/** 동적 질문에 답한 값 — 슬롯 id 별 */
export interface SlotAnswer {
  value: string | null;
  status: AnalysisStatus;
}

/** plan.answers["__analysis"] 에 들어가는 모양 */
export interface AnalysisRecord {
  analysis: BusinessAnalysis;
  /** 동적 질문 답 — 슬롯 id 별. "아직 모르겠어요"는 value=null, status=unknown */
  slots: Record<string, SlotAnswer>;
  /** 끝난 라운드 수 (최대 2) */
  rounds: number;
  /** 사용자가 "지금 정보로 작성하기"를 눌렀거나 종료 조건을 만족했는가 */
  finished: boolean;
  analyzedAt: string;
}

/* ───────── Zod — LLM 출력 검증 ───────── */

// status 는 문자열로 받고 normalize 에서 셋 중 하나로 굳힌다 — 모르는 값은 inferred(승격 금지)
const status = z.string().max(20);

const strField = z
  .object({
    value: z.string().max(300).nullable().optional(),
    status: status.optional(),
    confidence: z.number().min(0).max(1).optional(),
  })
  .partial();

const arrField = z
  .object({
    value: z.array(z.string().max(80)).max(12).nullable().optional(),
    status: status.optional(),
    confidence: z.number().min(0).max(1).optional(),
  })
  .partial();

/**
 * 느슨한 스키마 + 엄격한 normalize.
 * 모델이 필드를 빠뜨리거나 모양을 조금 틀려도 전체를 버리지 않고, 빠진 것은
 * unknown 으로 채운다. 단, 태그는 사전 밖이면 무조건 버린다.
 */
export const rawAnalysisSchema = z.object({
  primary: strField.optional(),
  modelTags: arrField.optional(),
  operationTags: arrField.optional(),
  customer: strField.optional(),
  problem: strField.optional(),
  solution: strField.optional(),
  revenueModel: strField.optional(),
  deliveryModel: strField.optional(),
  acquisitionChannels: arrField.optional(),
  keyCosts: arrField.optional(),
  stage: strField.optional(),
  region: strField.optional(),
  gapHints: z.array(z.object({ slot: z.string().max(60), why: z.string().max(120) })).max(10).optional(),
  summaryForUser: z.string().max(400).optional(),
});

type RawStr = z.infer<typeof strField> | undefined;
type RawArr = z.infer<typeof arrField> | undefined;

function normStr(f: RawStr): AnalysisField<string> {
  const value = typeof f?.value === "string" ? f.value.trim() : "";
  if (!value) return { value: null, status: "unknown" };
  const st: AnalysisStatus = f?.status === "confirmed" ? "confirmed" : "inferred";
  return { value, status: st, ...(typeof f?.confidence === "number" ? { confidence: f.confidence } : {}) };
}

function normArr(f: RawArr, allow?: ReadonlySet<string>): AnalysisField<string[]> {
  const raw = Array.isArray(f?.value) ? f!.value! : [];
  const cleaned = Array.from(
    new Set(
      raw
        .map((v) => String(v).trim())
        .filter(Boolean)
        .filter((v) => (allow ? allow.has(v) : true)),
    ),
  );
  if (!cleaned.length) return { value: null, status: "unknown" };
  const st: AnalysisStatus = f?.status === "confirmed" ? "confirmed" : "inferred";
  return { value: cleaned, status: st };
}

const PRIMARY_SET = new Set<string>(PRIMARY_INDUSTRIES);
const MODEL_SET = new Set<string>(Object.keys(MODEL_TAGS));
const OP_SET = new Set<string>(Object.keys(OPERATION_TAGS));

/**
 * LLM 출력(이미 JSON.parse 된 객체) → 검증된 BusinessAnalysis.
 * 스키마에 맞지 않으면 null — 호출부는 기존 위저드로 폴백한다.
 */
export function normalizeAnalysis(input: unknown): BusinessAnalysis | null {
  const parsed = rawAnalysisSchema.safeParse(input);
  if (!parsed.success) return null;
  const r = parsed.data;

  const primary = normStr(r.primary);
  if (primary.value && !PRIMARY_SET.has(primary.value)) primary.value = "기타";

  const analysis: BusinessAnalysis = {
    primary,
    modelTags: normArr(r.modelTags, MODEL_SET) as AnalysisField<ModelTag[]>,
    operationTags: normArr(r.operationTags, OP_SET) as AnalysisField<OperationTag[]>,
    customer: normStr(r.customer),
    problem: normStr(r.problem),
    solution: normStr(r.solution),
    revenueModel: normStr(r.revenueModel),
    deliveryModel: normStr(r.deliveryModel),
    acquisitionChannels: normArr(r.acquisitionChannels),
    keyCosts: normArr(r.keyCosts),
    stage: normStr(r.stage),
    region: normStr(r.region),
    gapHints: (r.gapHints ?? []).map((g) => ({ slot: g.slot.trim(), why: g.why.trim() })).filter((g) => g.slot && g.why),
    summaryForUser: (r.summaryForUser ?? "").trim(),
  };
  // 요약조차 없으면 보여줄 것이 없다 — 실패로 본다
  if (!analysis.summaryForUser) return null;
  return analysis;
}

/** 저장된 레코드 읽기 — 모양이 어긋나면 null (옛 플랜·손상 데이터 보호) */
export function readAnalysisRecord(answers: Record<string, Record<string, unknown>> | undefined): AnalysisRecord | null {
  const raw = answers?.[ANALYSIS_KEY] as Partial<AnalysisRecord> | undefined;
  if (!raw || typeof raw !== "object") return null;
  const analysis = normalizeAnalysis(raw.analysis);
  if (!analysis) return null;
  const slots: Record<string, SlotAnswer> = {};
  for (const [k, v] of Object.entries(raw.slots ?? {})) {
    if (!v || typeof v !== "object") continue;
    const sv = v as Partial<SlotAnswer>;
    const st: AnalysisStatus = sv.status === "confirmed" ? "confirmed" : sv.status === "inferred" ? "inferred" : "unknown";
    slots[k] = { value: typeof sv.value === "string" ? sv.value : null, status: st };
  }
  return {
    analysis,
    slots,
    rounds: Math.max(0, Math.min(2, Number(raw.rounds) || 0)),
    finished: Boolean(raw.finished),
    analyzedAt: typeof raw.analyzedAt === "string" ? raw.analyzedAt : "",
  };
}

/** 분석 필드 이름 → 화면 라벨 (VERIFY 카드) */
export const VERIFY_FIELDS: Array<{ key: keyof BusinessAnalysis; label: string }> = [
  { key: "primary", label: "사업 유형" },
  { key: "customer", label: "고객" },
  { key: "solution", label: "제공하는 것" },
  { key: "deliveryModel", label: "운영 형태" },
  { key: "revenueModel", label: "수익 구조" },
  { key: "acquisitionChannels", label: "고객 유입" },
];
