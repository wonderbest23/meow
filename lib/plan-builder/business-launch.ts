import { z } from "zod";
import { parseWonAmount } from "./answer-number";
import { coachFieldDisplay } from "./coach-presentation";
import { coachDocumentRevision, readCoach } from "./coach";
import { effectiveStructure, readIntake } from "./intake-core";
import { isFinanceKsic, ksicByCode, ksicStructure, licenseHint, STRUCTURE_AXES, STRUCTURE_LABELS, type BusinessStructure } from "./ksic";
import type { Plan } from "./plan-store";
import { ONLINE_SALES_SOURCES, ONLINE_SALES_STEP, playbookChecklist, playbookForKsic, playbookForText, withOnlineSales, type IndustryPlaybook } from "./industry-playbooks";
import { businessTypeFor, type BusinessTypeId } from "./business-types";

export const LAUNCH_KEY = "__business_launch";
/* checked — 업종 준비 체크리스트에서 표시한 항목(예: need:0, step:2). 예전 기록에는 없어서 선택 항목 */
const recordSchema = z.object({ status: z.enum(["done", "skipped", "pending"]), signature: z.string(), note: z.string().max(10000).default(""), material: z.string().max(20000).default(""), checked: z.array(z.string().max(20)).max(100).optional(), at: z.string() });
const quoteSchema = z.object({ name: z.string().max(100).default(""), monthly: z.string().max(20).default(""), deposit: z.string().max(20).default(""), initial: z.string().max(20).default("") });
export const launchSchema = z.object({
  purpose: z.enum(["ideas", "launch", "improve"]).default("launch"),
  workplace: z.enum(["unknown", "remote", "shared", "shop"]).default("unknown"),
  registered: z.enum(["unknown", "yes", "no"]).default("unknown"),
  region: z.string().max(100).default(""),
  configured: z.boolean().default(false),
  records: z.record(z.string(), recordSchema).default({}),
  quotes: z.array(quoteSchema).max(3).default([]),
});
export type LaunchState = z.infer<typeof launchSchema>;
/** 업종 준비 단계의 체크리스트 — 화면에서 글 덩어리 대신 표시할 수 있는 목록으로 보여 준다 */
export type LaunchChecklist = { needs: string[]; steps: IndustryPlaybook["steps"]; pitfalls: string[] };
export type LaunchStep = { id: string; title: string; task: string; materialTitle: string; material: string; prompt: string; caution?: string; links?: Array<{ title: string; url: string }>; service?: "website" | "marketing"; checklist?: LaunchChecklist;
  /** 펼쳐 보이는 확인 목록(체크 표시 가능) — 예전엔 자료 글 안에 접혀 있어 단계가 비어 보였다(2026-10-22 결제 단계) */
  checks?: string[]; signature: string;
  /** 대화에서 이미 정한 단계(예: 상품·가격을 직접 답함) — 기록이 없어도 끝난 것으로 본다(launchStatus). 열어서 다듬을 수는 있다 */
  decided?: boolean };

/*
 * 사업 모양 — 결제 준비·첫 홍보 글·홍보 키트를 사업에 맞게 고를 때 쓴다(예전엔 모든 사업이 온라인 결제·동네 가게 기준이었다).
 * 계획서와 같은 규칙(business-types.ts)으로 정한다: 직접 고른 구조 → 사업 설명 → 업종 가이드 → 업종 기본 구조.
 */
export type BusinessShape = "store" | "visit" | "online" | "booking" | "b2b" | "general";
const SHAPE_OF_TYPE: Record<BusinessTypeId, BusinessShape> = { store: "store", lesson: "store", visit: "visit", ship: "online", app: "online", platform: "online", space: "booking", b2b: "b2b" };

/** 업종 코드가 있으면 코드로, 없으면 사업 설명으로 업종 가이드와 사업 모양을 찾는다(계획서 쪽 intake-context 와 같은 순서) */
export function businessProfile(plan: Pick<Plan, "answers">): { ksicEntry: ReturnType<typeof ksicByCode>; playbook: IndustryPlaybook | null; playbookBy: "ksic" | "description" | null; shape: BusinessShape; typeId: BusinessTypeId | null; offering: BusinessStructure["offering"] | null } {
  const coach = readCoach(plan.answers);
  const intake = readIntake(plan.answers as Record<string, Record<string, unknown>>);
  const ksicEntry = intake?.ksic ? ksicByCode(intake.ksic) : undefined;
  const value = (key: string) => coach?.fields.find(f => f.key === key)?.value ?? "";
  const described = coach ? [coach.business.description, value("business"), value("offer")].filter(Boolean).join(" ") : "";
  const customer = value("customer") || null;
  const playbook = ksicEntry ? playbookForKsic(ksicEntry.code) : playbookForText(described, { customer });
  const effective = intake ? effectiveStructure(intake) : null;
  const chosen = effective ? Object.fromEntries(STRUCTURE_AXES.flatMap(axis => effective.basis[axis] === "user" && effective.values[axis] ? [[axis, effective.values[axis]]] : [])) as Partial<BusinessStructure> : null;
  const typed = businessTypeFor({ chosen, description: described, customer: customer ?? undefined, playbookId: playbook?.id, structure: effective?.values ?? (ksicEntry ? ksicStructure(ksicEntry.code) ?? null : null) });
  // 택배로 파는 사업이면 업종 가이드에 온라인 판매 준비(통신판매업 신고·청약철회·수수료·택배비)를 더한다 — 캔들 공방 가이드에는 없었다
  const guide = playbook && typed?.type.id === "ship" ? withOnlineSales(playbook) : playbook;
  return { ksicEntry, playbook: guide, playbookBy: playbook ? (ksicEntry ? "ksic" : "description") : null, shape: typed ? SHAPE_OF_TYPE[typed.type.id] : "general", typeId: typed?.type.id ?? null, offering: effective?.values.offering ?? null };
}

/**
 * 계획서 표지의 '업종' — 확정한 표준산업분류 이름, 없으면 사업 설명으로 찾은 업종 가이드 이름, 없으면 넓은 업종 이름.
 * 2026-10-22: 캔들 스마트스토어 표지에 '업종 기업 서비스'가 찍혔다(잘못 고른 넓은 업종).
 */
export function documentIndustryLabel(plan: Pick<Plan, "answers">): string {
  const { ksicEntry, playbook } = businessProfile(plan);
  return ksicEntry?.name ?? playbook?.name ?? readCoach(plan.answers)?.business.industry ?? "";
}

/** 스마트스토어·쇼핑몰처럼 판매 플랫폼에서 주문받는다는 말 */
const STORE_SALES = /스마트\s*스토어|온라인\s*(?:스토어|쇼핑몰)|쇼핑\s*몰|오픈\s*마켓|쿠팡|아이디어스|네이버\s*쇼핑|자사\s*몰/;
/*
 * 홈페이지가 손님에게 주문을 어디로 안내할지 — 온라인으로 파는 사업이 사업 설명·판매 채널에서 스토어로 판다고 했으면
 * 홈페이지 문의로 주문받지 않는다(2026-10-22 캔들 스토어: '② 주문하기 — 홈페이지의 문의 버튼으로 향과 개수를 남겨 주세요').
 * perItem: 상품 1개 단위로 파는 사업 — 가격 카드가 '1개 25,000원'으로 쓰고 '가격 기준(1회·월 등)' 문장을 붙이지 않는다.
 */
export function homepageSalesMode(plan: Pick<Plan, "answers">): { storeOnly: boolean; perItem: boolean } {
  const profile = businessProfile(plan);
  const coach = readCoach(plan.answers);
  const words = coach ? [coach.business.description, ...coach.fields.filter(f => ["business", "channel", "offer"].includes(f.key)).map(f => f.value)].join(" ") : "";
  return {
    storeOnly: profile.shape === "online" && profile.typeId === "ship" && STORE_SALES.test(words),
    perItem: profile.typeId === "ship" || profile.offering === "goods",
  };
}

/*
 * 판매 플랫폼(스마트스토어·오픈마켓)에서 파는 사업 — 결제는 플랫폼이 받으므로 PG 연동이 아니라 정산·수수료를 본다.
 * 예전엔 온라인 공통 문구('신청 내용과 고객 연락 방법', '결제 연동(PG)')가 나왔다(2026-10-22 캔들 스토어).
 */
const PLATFORM_PAYMENT = { task: "손님이 스토어에서 주문·결제하고 상품을 받은 뒤, 내가 정산받는 과정을 한 번 따라가 봐요.",
  checks: ["판매자 가입과 정산 계좌 등록(심사 기간 포함)", "판매·결제 수수료와 정산 주기(판매자 센터 안내로 확인)", "상품 가격과 배송비(무료배송 여부)·묶음배송 표시", "주문 확인·발송 처리와 송장 입력 방법", "반품·교환 안내: 받은 날부터 7일 안 청약철회와 예외(사용한 상품 등), 반품 배송비", "판매 페이지의 사업자 정보·통신판매업 신고번호 표시"],
  fill: ["선택한 판매 플랫폼:", "수수료·정산 조건:", "실제 주문 테스트 결과:"],
  caution: "이 단계는 준비 점검이에요. 판매자 심사나 정산 계좌 등록이 끝났다는 뜻은 아니에요.",
  hint: "이 사업은 스마트스토어 같은 판매 플랫폼에서 팔아요. 결제는 플랫폼이 받으니 결제대행(PG) 연동 대신 플랫폼 정산·수수료·배송 기준으로 정리해 주세요." };
const PLATFORM_SALES = /스마트\s*스토어|오픈\s*마켓|쿠팡|아이디어스|네이버\s*쇼핑|11번가|지마켓|G마켓/;
/* 주문·결제 단계 — 사업 모양마다 실제로 준비할 것이 다르다(매장은 카드단말기, 숙소는 예약 플랫폼 정산, 온라인은 결제 연동) */
const PAYMENT_BY_SHAPE: Record<BusinessShape, { task: string; checks: string[]; fill: string[]; caution: string; hint: string }> = {
  store: { task: "손님이 주문하고 계산한 뒤 영수증을 받는 과정을 한 번 따라가 봐요.",
    checks: ["카드단말기·POS 설치와 카드 가맹 신청(심사 기간 포함)", "현금영수증 발급 방법과 계좌이체 받을 통장", "가격표·메뉴판에 최종 금액 표시", "주문·예약 받는 방법(방문·전화·온라인)", "취소·환불 기준과 안내할 위치", "매출 기록과 영수증 보관 방법"],
    fill: ["선택한 단말기·POS 업체:", "설치·가맹 상태:", "실제 결제 테스트 결과:"],
    caution: "이 단계는 준비 점검이에요. 카드 가맹이나 단말기 설치가 끝났다는 뜻은 아니에요.",
    hint: "이 사업은 손님이 찾아와 계산하는 곳이에요. 카드단말기·POS·현금영수증 기준으로 정리해 주세요." },
  visit: { task: "손님이 예약하고 작업을 받은 뒤 계산하는 과정을 한 번 따라가 봐요.",
    checks: ["예약·견적 받는 방법과 확정 연락", "출장비·추가 작업비를 넣은 최종 금액 안내", "현장 결제 방법(휴대폰 카드결제·계좌이체)과 현금영수증", "작업 범위와 끝났는지 확인하는 방법", "취소·일정 변경·환불 기준", "사고·파손이 생겼을 때 처리 방법"],
    fill: ["선택한 결제 방법:", "준비 상태:", "실제 결제 테스트 결과:"],
    caution: "이 단계는 준비 점검이에요. 카드 결제 가맹이나 보험 가입이 끝났다는 뜻은 아니에요.",
    hint: "이 사업은 손님에게 찾아가는 일이에요. 현장 결제·계좌이체·현금영수증 기준으로 정리해 주세요." },
  online: { task: "고객이 문의하고 결제한 뒤 상품을 받는 과정을 한 번 따라가 봐요.",
    checks: ["주문·신청 내용과 고객 연락 방법", "최종 금액과 배송비·추가 비용 표시", "제공·배송 시점과 제공 범위", "취소·환불·교환 안내와 문의 방법", "결제 승인·실패·중복 결제 처리", "필요한 사업자·판매자·개인정보 안내(통신판매업 신고 포함)"],
    fill: ["선택한 결제 제공사·판매 플랫폼:", "심사·연결 상태:", "실제 테스트 결과:"],
    caution: "이 단계는 연결 준비예요. 결제사 심사·가맹점 등록·실제 결제 연동이 완료됐다는 뜻은 아니에요.",
    hint: "이 사업은 온라인으로 주문받아요. 결제 연동(PG)·판매 플랫폼·배송 기준으로 정리해 주세요." },
  booking: { task: "손님이 예약하고 결제한 뒤 이용하고, 내가 정산받는 과정을 한 번 따라가 봐요.",
    checks: ["올릴 예약 플랫폼과 직접 예약 받는 방법(전화·홈페이지)", "플랫폼 수수료와 정산 주기·정산 계좌", "이용 요금과 추가 인원·청소비 등 최종 금액 표시", "예약 확정·변경·노쇼 처리", "취소·환불 규정(플랫폼과 직접 예약을 같게)", "직접 예약일 때 결제 방법과 현금영수증"],
    fill: ["선택한 예약 플랫폼:", "수수료·정산 조건:", "실제 예약 테스트 결과:"],
    caution: "이 단계는 준비 점검이에요. 플랫폼 입점 심사나 정산 계좌 등록이 끝났다는 뜻은 아니에요.",
    hint: "이 사업은 예약을 받아 공간을 빌려줘요. 예약 플랫폼 정산·수수료와 직접 예약 결제 기준으로 정리해 주세요." },
  b2b: { task: "견적을 보내고 계약한 뒤 대금을 받는 과정을 한 번 따라가 봐요.",
    checks: ["견적서·계약서에 넣을 범위와 금액(부가세 포함 여부)", "세금계산서 발행 방법", "대금 받는 시기(선금·잔금)와 입금 계좌", "납품·완료 확인 방법", "지연·하자·계약 해지 기준"],
    fill: ["견적서 양식:", "세금계산서 발행 준비:", "실제 거래 진행 결과:"],
    caution: "이 단계는 준비 점검이에요. 계약이나 대금 입금이 끝났다는 뜻은 아니에요.",
    hint: "이 사업은 사업자 고객과 거래해요. 견적서·세금계산서·계좌이체 기준으로 정리해 주세요." },
  general: { task: "고객이 문의하고 결제한 뒤 상품을 받는 과정을 한 번 따라가 봐요.",
    checks: ["주문·문의 받는 방법과 고객 연락 방법", "최종 금액과 추가 비용 표시", "결제 방법(카드·계좌이체·온라인 결제 가운데 맞는 것)과 현금영수증", "제공 시점과 제공 범위", "취소·환불 안내와 문의 방법", "필요한 사업자·판매자·개인정보 안내"],
    fill: ["선택한 결제 방법:", "준비·연결 상태:", "실제 테스트 결과:"],
    caution: "이 단계는 준비 점검이에요. 카드 가맹·결제사 심사·실제 결제 연결이 끝났다는 뜻은 아니에요.",
    hint: "" },
};
/* 첫 홍보 글 끝에 넣을 '어디서 만나는지' 한 줄 */
const MARKETING_WHERE: Record<BusinessShape, string> = {
  store: "위치: [주소 입력] · 영업시간: [영업시간 입력]",
  visit: "가는 지역: [지역 입력] · 예약·문의: [연락 방법 입력]",
  online: "주문하는 곳: [스토어 주소 입력]",
  booking: "예약하는 곳: [예약 링크 입력]",
  b2b: "문의: [연락 방법 입력]",
  general: "문의: [연락 방법 입력]",
};
/*
 * 처음 여는 준비 과정의 기본값 — 대화에서 이미 들은 것으로 채운다. 예전엔 대화에서 답한 것을 다시 물었다
 * ('어디까지 도와드릴까요?', 운영 중인 가게에 '일할 공간이 필요한가요?'·'사업자등록은 하셨나요?' — 여정 점검 2026-10-22).
 * 운영 중이면 이미 등록한 사업이고 일하는 곳이 있다(업종이 무점포면 사무실 없이). 새로 시작하면 고른 업종(또는 직접 고른 구조)이
 * 매장형인지 무점포인지로 일할 곳을 짐작하고, 사업자등록은 아직 모르는 것으로 둔다. 화면은 이 값을 한 번 확인받는다.
 */
export function launchDefaults(plan: Pick<Plan, "answers">): LaunchState {
  const operating = readCoach(plan.answers)?.stage === "operating";
  const intake = readIntake(plan.answers as Record<string, Record<string, unknown>>);
  const effective = intake ? effectiveStructure(intake) : null;
  // 업종(분류 코드)을 골랐거나 제공 방식을 직접 골랐을 때만 짐작한다 — 큰 분류 기본값만으로는 짐작하지 않는다
  const known = !!effective && (!!intake?.ksic || effective.basis.delivery === "user");
  const values = known ? effective!.values : null;
  const workplace: LaunchState["workplace"] = values && (values.capital === "storefront" || values.delivery === "store") ? "shop"
    : values && values.capital === "remote" && (values.delivery === "online" || values.delivery === "visit") ? "remote"
    : operating ? "shop" : "unknown";
  return launchSchema.parse({ purpose: operating ? "improve" : "launch", workplace, registered: operating ? "yes" : "unknown" });
}
export function readLaunch(plan: Plan): LaunchState {
  const parsed = launchSchema.safeParse(plan.answers[LAUNCH_KEY]);
  return parsed.success ? parsed.data : launchDefaults(plan);
}
export function useOperatingWorkflow(state: LaunchState): LaunchState {
  return { ...state, purpose: "improve" };
}
export const LAUNCH_SOURCES = {
  registration: { title: "국세청 · 사업자등록 제출서류", url: "https://www.nts.go.kr/nts/ad/cntnts/cntntsView.do?mi=2445" },
  tax: { title: "국세청 · 인터넷 세법상담", url: "https://b.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=109144&mi=13365" },
  lease: { title: "법무부 · 개정 상가 임대차 표준계약서 안내", url: "https://www.corrections.go.kr/bbs/moj/182/494574/download.do" },
};

export function launchSteps(plan: Plan, settings: LaunchState): LaunchStep[] {
  const coach = readCoach(plan.answers);
  const improving = settings.purpose === "improve";
  const field = (key: string, fallback = "아직 정하지 않음") => { const value = coach?.fields.find(f => f.key === key)?.value; return value != null ? coachFieldDisplay(value) : fallback; };
  const business = field("business", plan.title), offer = field("offer"), customer = field("customer"), price = field("price"), channel = field("channel");
  const context = `사업: ${plan.title}\n소개: ${business}\n상품: ${offer}\n고객: ${customer}\n가격: ${price}`;
  const base = { signature: JSON.stringify([coach ? coachDocumentRevision(coach) : plan.title, settings.purpose, settings.workplace, settings.registered]) };
  /*
   * 대화에서 상품과 가격을 직접 답했으면 '팔고 싶은 상품을 정해요'는 이미 정한 것 — 첫 단계로 다시 묻지 않는다(여정 점검 2026-10-23).
   * AI 제안(proposal)으로만 채워졌거나 운영 개선 · 아이디어 검토면 그대로 둔다.
   */
  const userAnswered = (key: string) => { const item = coach?.fields.find(f => f.key === key); return item?.basis === "user" && item.value != null && String(item.value).trim() !== ""; };
  const offerDecided = settings.purpose === "launch" && userAnswered("offer") && userAnswered("price");
  const result: LaunchStep[] = [{ ...base, ...(offerDecided ? { decided: true } : {}), id: "offer", title: settings.purpose === "improve" ? "상품을 더 다듬어요" : "팔고 싶은 상품을 정해요", task: "정리된 상품 소개를 읽고 바꾸고 싶은 내용만 남겨 주세요.", materialTitle: "상품 소개 초안", material: `${plan.title}\n\n${business}\n\n제공 내용: ${offer}\n이용 고객: ${customer}\n검토 중인 가격: ${price}\n문의·판매 경로: ${channel}`, prompt: "현재 상품 소개를 고객에게 바로 보여줄 수 있는 문장으로 다듬어 주세요. 정해지지 않은 구성과 가격은 제안으로 표시하고 효과나 실적은 만들지 마세요." }];
  if (settings.purpose === "ideas") return result;
  result.push({ ...base, id: "operations", title: improving ? "현재 운영에서 바꿀 일을 정해요" : "작게 시작할 범위를 정해요", task: improving ? "현재 문제와 비용을 확인하고 유지할 일과 바꿔볼 일을 나눠요." : "처음 제공할 범위와 감당할 수 있는 비용을 확인해요.", materialTitle: "운영 범위 메모", material: improving
    ? `${context}\n\n현재 문제: ${field("problem")}\n현재 매출(제공된 정보): ${field("sales")}\n매달 나가는 비용: ${field("cost")}\n운영 범위: ${field("capacity")}\n개선 목표: ${field("goal")}\n\n유지할 일:\n이번에 바꿔볼 일:\n확인할 기간과 실제 결과:`
    : `${context}\n\n준비 예산: ${field("budget")}\n처음 드는 비용: ${field("setupCost")}\n매달 나가는 비용: ${field("cost")}\n운영 범위: ${field("capacity")}\n일주일에 쓸 수 있는 시간: ${field("hoursPerWeek")}\n\n이번에 하지 않을 일:\n추가로 필요한 준비물:`, prompt: improving
    ? "현재 운영 중인 사업의 문제와 제공된 매출·비용을 바탕으로 유지할 일, 바꿀 일, 다음 실험 하나와 확인 기준을 정해 주세요. 기록하지 않은 실적은 만들지 말고 원인 가설과 실제 결과를 구분해 주세요. 새 창업 준비로 되돌리지 마세요."
    : "현재 사업의 첫 운영 범위를 작게 정하고, 이미 알려준 예산과 시간으로 가능한 준비물·작업 순서·보류할 일을 구체적으로 제안해 주세요. 모르는 비용을 0원이나 실제 견적으로 확정하지 마세요." });
  /*
   * 업종 준비(인허가) 단계 — 사업장 계약보다 먼저 둔다(업종 체크리스트 첫 줄이 '계약 전에 건축물 용도 확인'이다).
   * 업종 코드가 있으면 코드로, 없으면 사업 설명으로 업종 가이드를 찾는다 — 상담으로 시작한 사업은 대부분 코드가 없어
   * 예전엔 카페도 휴게음식점 신고·위생교육 단계가 빠졌다. 법적 판단이 아니라 출발점 안내다.
   */
  const { ksicEntry, playbook: foundPlaybook, playbookBy, shape, typeId } = businessProfile(plan);
  const structure = ksicEntry ? ksicStructure(ksicEntry.code) : undefined;
  const hint = structure ? licenseHint(structure, ksicEntry?.code) : null;
  // 업종 가이드가 있는 업종은 준비물·신고 순서·자주 놓치는 것까지 체크리스트로 준다(빵집을 처음 여는 사람도 순서대로 따라갈 수 있게)
  const playbook = !improving ? foundPlaybook : null;
  const lodging = foundPlaybook?.id === "lodging";
  if (playbook) result.push({ ...base, id: "license", title: `${playbook.name} 시작 준비: 준비물과 신고 순서`, task: "아래 순서대로 준비하면 필요한 신고·등록부터 손님을 받기 시작하는 단계까지 이어져요. 단계마다 관할 기관에서 확인한 날짜를 메모에 적어 두세요.", materialTitle: `${playbook.name} 준비 체크리스트`,
    /* 확정한 업종 이름을 맨 위에 — 무슨 업종 기준의 준비물인지 체크리스트만 봐도 알게(분류 코드는 초보 사장님께 뜻이 없어 뺐다) */
    material: `${ksicEntry ? `업종: ${ksicEntry.name}\n\n` : ""}${playbookChecklist(playbook)}`, checklist: { needs: playbook.needs, steps: playbook.steps, pitfalls: playbook.pitfalls }, prompt: `${playbook.name}을 시작하기 전에 필요한 준비물·신고 순서·자주 놓치는 점을 내 사업(위치·규모·판매 방식)에 맞춰 구체화해 주세요. 관할 기관에서 확인하지 않은 기한·수수료·면적 기준은 만들지 말고 확인 필요로 남겨 주세요.`,
    caution: `${playbookBy === "description" ? "사업 설명으로 찾은 업종이에요. 내 사업과 다르면 이 단계는 '나중에 할게요'로 넘겨 주세요. " : ""}업종별로 일반적인 순서를 정리한 출발점이에요. 지역·규모·세부 판매 방식에 따라 다르니 각 단계는 관할 기관에서 확인해 주세요.`, links: playbook.links });
  else if (ksicEntry && structure && hint && !improving) result.push({ ...base, id: "license", title: "업종 인허가를 확인해요", task: hint, materialTitle: "인허가 확인 메모",
    material: `업종: ${ksicEntry.name}\n분류 기준 절차: ${STRUCTURE_LABELS.license[structure.license]}\n확인할 기관(${isFinanceKsic(ksicEntry.code) ? "금융감독원·금융위원회 등" : "구청·세무서·협회 등"}):\n확인한 날짜:\n필요 서류·비용:\n비고:`,
    prompt: "이 업종을 시작하기 전에 필요한 신고·허가·자격을 관할 기관 기준으로 정리해 주세요. 확인되지 않은 항목은 확인 필요로 남깁니다.", caution: "인허가 요건은 지역·규모·세부 업태에 따라 달라요. 여기 안내는 업종 분류로 정리한 출발점이고, 최종 확인은 관할 기관에서 해요.",
    links: [{ title: "정부24", url: "https://www.gov.kr" }] });
  if (settings.workplace === "unknown") result.push({ ...base, id: "workspace-choice", title: "일할 공간이 필요한지 알아봐요", task: "사무실을 먼저 계약하지 않아도 돼요. 현재 사업에 필요한 공간부터 검토해요.", materialTitle: "작업 공간 검토 메모", material: `${context}\n\n고객이 직접 방문해야 하는지:\n장비·재고를 보관할 공간이 필요한지:\n집이나 온라인에서 할 수 있는 작업:\n별도 확인이 필요한 주소·시설 조건:`, prompt: "현재 사업에 사무실·점포가 실제로 필요한지 검토해 주세요. 온라인 운영, 집에서 작업, 소호·공유사무실, 점포 중 적용 가능한 선택지를 비교하고, 확인되지 않은 주소 사용·인허가 적합성을 확정하지 마세요." });
  // 이미 운영 중인 가게(운영 개선하기)는 이미 공간이 있다 — '사업장 계약 조건 확인' 단계를 주지 않는다(여정 점검 2026-10-22)
  if (!improving && (settings.workplace === "shared" || settings.workplace === "shop")) result.push({ ...base, id: "workplace", title: settings.workplace === "shared" ? "소호·공유사무실을 비교해요" : lodging ? "숙소 건물과 계약 조건을 확인해요" : "사업장 계약 조건을 확인해요", task: "받은 견적과 이용 조건을 비교하고 계약 전 질문을 준비해요.", materialTitle: "사업장 문의 초안", material: `안녕하세요. ${business} 사업을 준비하고 있습니다.\n${settings.region ? `희망 지역은 ${settings.region}입니다.\n` : ""}다음 조건을 포함한 서면 견적을 받고 싶습니다.\n\n${settings.workplace === "shared" ? "1. 상주 좌석 이용인지, 비상주 주소 이용인지\n2. 보증금·월 이용료·관리비·초기 비용 및 부가세 포함 여부\n3. 우편 수령·회의실·추가 인원 비용" : lodging ? "1. 객실 수·면적과 숙박 영업(민박·숙박업)에 쓸 수 있는 건물 용도인지\n2. 보증금·월세·관리비 및 부가세 포함 여부\n3. 소방 설비·전기·가스·급배수 조건과 고칠 수 있는 범위" : "1. 전용 면적과 간판·인테리어 가능 범위\n2. 보증금·월세·관리비·권리금 및 부가세 포함 여부\n3. 전기 용량·급배수·환기 등 설비 조건"}\n4. 제 업종의 사업자등록과 실제 영업에 적합한 공간인지\n5. 계약 당사자와 공간 제공 권한을 확인할 서류\n6. 이용 기간·중도 해지·자동 연장·보증금 반환 조건\n7. 주소 변경 및 폐업 시 필요한 절차\n\n계약서 초안과 전체 비용 내역을 함께 부탁드립니다.`, caution: settings.workplace === "shared" ? "소호오피스도 상주형과 비상주형이 달라요. 저렴하다는 이유만으로 고르지 말고, 등록 가능 여부와 계약은 관할 기관·전문가에게 확인해 주세요. 위 초안은 문의용이지 계약서가 아니에요." : lodging ? "숙소는 운영 형태(농어촌민박·외국인관광 도시민박·숙박업)에 따라 쓸 수 있는 건물과 소방 기준이 달라요. 계약 전에 관할 시·군·구청과 소방서에 확인해 주세요. 위 초안은 문의용이지 계약서가 아니에요." : "매장·작업장은 업종에 따라 영업 신고가 되는 건물인지(용도), 설비 조건이 맞는지가 달라요. 계약 전에 관할 기관·전문가에게 확인해 주세요. 위 초안은 문의용이지 계약서가 아니에요.", links: lodging ? [LAUNCH_SOURCES.registration] : [LAUNCH_SOURCES.lease, LAUNCH_SOURCES.registration], prompt: "현재 사업의 사무실 견적과 계약 전 확인할 질문을 정리해 주세요. 법적 적합성·권리관계·등록 가능 여부를 확인했다고 단정하지 말고, 실제 견적이 없으면 임대료 시세를 만들지 마세요." });
  if (settings.registered !== "yes") result.push({ ...base, id: "registration", title: "사업자등록 준비를 확인해요", task: "실제로 판매를 시작할 시점에 맞춰 필요한 서류와 업종을 공식 안내에서 확인해요.", materialTitle: "등록 상담용 사업 설명", material: `${context}\n\n사업장 방식: ${settings.workplace === "remote" ? "별도 사무실 없이 운영 검토" : settings.workplace === "shared" ? "소호·공유사무실 검토" : settings.workplace === "shop" ? "점포·사업장 검토" : "미정"}\n\n확인하고 싶은 내용:\n- 사업 내용에 맞는 업종과 신청 서류\n- 주소 사용과 임차 관련 제출 자료\n- 해당 업종의 별도 인허가·신고 여부\n- 실제 개업 예정일에 맞는 신청 일정`, caution: "사업 아이디어를 확인하는 것과 실제 영업은 달라요. 여기서 준비 완료를 눌러도 사업자등록이 신청되지는 않아요.", links: [LAUNCH_SOURCES.registration], prompt: "현재 사업으로 관할 세무서에 물어볼 등록 상담 질문지를 작성해 주세요. 업종코드·허가 여부·신청 완료를 임의로 확정하지 마세요." });
  /*
   * 통신판매업 신고 — 택배로 파는 사업은 따로 한 단계로 둔다(예전엔 업종 체크리스트의 한 줄이라 실행 화면에서 묻혔다).
   * 사업자등록증·구매안전서비스 이용확인증이 들어가므로 사업자등록 다음에 둔다.
   */
  if (!improving && typeId === "ship") result.push({ ...base, id: "mail-order", title: "통신판매업 신고를 해요", task: "온라인으로 직접 팔기 전에 관할 시·군·구청(정부24로도 신청)에 통신판매업을 신고해요. 사업자등록을 먼저 하고, 판매 플랫폼에서 구매안전서비스 이용확인증을 받아 함께 내요.", materialTitle: "통신판매업 신고 준비 메모",
    checks: ["사업자등록증(먼저 등록)", "구매안전서비스 이용확인증(스마트스토어·오픈마켓 판매자 센터에서 발급)", "신고 면제 대상인지 확인(간이과세자·직전 해 거래 횟수 기준, 공정거래위원회 고시)", "받은 신고번호를 판매 페이지 사업자 정보에 적기"],
    material: `${context}\n\n신고할 곳: 관할 시·군·구청 또는 정부24\n사업자등록번호:\n구매안전서비스 이용확인증 발급처:\n면제 대상 확인 결과:\n받은 신고번호:\n판매 페이지에 적은 날짜:`,
    caution: `${ONLINE_SALES_STEP.detail} 여기서 준비 완료를 눌러도 신고가 되지는 않아요.`, links: ONLINE_SALES_SOURCES,
    prompt: "현재 사업으로 통신판매업 신고를 준비하는 순서와 서류를 정리해 주세요. 신고 면제 여부·수수료·처리 기간은 관할 기관에서 확인하지 않았으면 확정하지 말고 확인 필요로 남겨 주세요." });
  result.push({ ...base, id: "tax", title: "세금 관리 방법을 정해요", task: "직접 관리할지 세무 상담을 받을지 결정할 수 있도록 사업 정보를 정리해요.", materialTitle: "세무 상담 요청 초안", material: `안녕하세요. 아래 사업의 세무 상담을 받고 싶습니다.\n\n${context}\n현재 매출(제공된 정보): ${field("sales")}\n월 비용: ${field("cost")}\n\n1. 제 사업에 필요한 신고 종류와 실제 신고 일정\n2. 직접 신고할 때 준비할 매출·매입·인건비 자료\n3. 기장료와 별도 신고 수수료, 포함 업무\n4. 증빙 전달 방식과 상담 범위\n5. 계약 해지와 자료 반환 조건\n\n상담 후 업무 범위와 비용을 서면으로 안내 부탁드립니다.`, caution: "세무사 자동 배정·예약은 아직 제공하지 않아요. 신고 종류와 일정은 사업 형태에 따라 확인해야 하며, 이 화면에서 신고가 처리되지는 않아요.", links: [LAUNCH_SOURCES.tax], prompt: "현재 사업의 세무 상담용 설명과 자료 준비 목록을 구체화해 주세요. 세율·신고기한은 검증된 자료가 없으면 확정하지 말고, 현재 매출과 예상 매출을 구별해 주세요." });
  result.push({ ...base, id: "website", title: "홈페이지 공개를 확인해요", task: "홈페이지는 왼쪽 목록의 3단계 '홈페이지'에서 만들고 공개해요. 여기서는 공개했는지 확인하고, 직접 만들기 어렵다면 디자인·개발 상담을 요청할 수 있어요.", materialTitle: "홈페이지 제작 요청서", material: `${context}\n\n홈페이지의 목적: 상품 소개와 문의 접수\n필요한 내용: 상품 설명, 가격, 신청 방법, 운영자 정보\n추가로 원하는 기능:\n보유한 사진·로고:\n연결하려는 도메인:\n희망 일정:`, service: "website", caution: "디자인·개발 대행은 별도 견적과 동의 후 진행해요. 도메인 구매나 외부 서비스 개통은 자동 완료되지 않아요.", prompt: "현재 사업의 홈페이지에 넣을 제목, 상품 설명, 문의 유도 문구와 섹션 구성을 작성해 주세요. 보유하지 않은 인증·후기·실적은 넣지 마세요." });
  const platformSeller = shape === "online" && PLATFORM_SALES.test(`${business} ${channel} ${coach?.business.description ?? ""}`);
  const pay = platformSeller ? PLATFORM_PAYMENT : PAYMENT_BY_SHAPE[shape];
  result.push({ ...base, id: "payment", title: platformSeller ? "주문·정산 흐름을 점검해요" : "주문·결제 흐름을 점검해요", task: pay.task, materialTitle: "판매 준비 점검표", checks: pay.checks, material: `판매할 상품: ${offer}\n검토 중인 가격: ${price}\n주문·문의 경로: ${channel}\n\n확인할 내용:\n${pay.checks.map(item => `- ${item}`).join("\n")}\n\n${pay.fill.join("\n")}`, caution: pay.caution, prompt: `현재 사업에서 고객 문의부터 주문, 결제, 제공, 사후 문의까지의 흐름과 테스트 시나리오를 작성해 주세요. 실제로 연결되지 않은 결제 기능을 연결 완료라고 표현하지 마세요.${pay.hint ? ` ${pay.hint}` : ""}` });
  result.push({ ...base, id: "marketing", title: "첫 홍보를 준비해요", task: "고객이 있는 채널 하나를 정하고 첫 게시물을 다듬어요.", materialTitle: "첫 홍보 글 초안", material: `${plan.title}\n\n${business}\n\n준비한 것: ${offer}\n${customer === "아직 정하지 않음" ? "" : `이런 분께 맞아요: ${customer}\n`}가격: ${price === "아직 정하지 않음" ? "[가격 입력]" : price}\n${MARKETING_WHERE[shape]}\n\n게시할 채널: ${channel}\n게시 예정일: [날짜 입력]`, caution: "저장된 사업 정보로 구성한 초안이에요. 가격·효과·이미지 사용 권한을 확인한 뒤 공개해 주세요. 직접 하기 어렵다면 유지보수 탭에서 블로그·SNS 운영을 신청할 수 있어요.", prompt: "현재 고객과 상품에 맞는 1주일 마케팅 계획과 바로 쓸 게시물 3개를 작성해 주세요. 채널별 작업시간, 적은 예산의 테스트 방법, 확인할 지표를 포함하고 성과를 보장하지 마세요." });
  result.push({ ...base, id: "review", title: "운영 결과로 개선해요", task: "알고 있는 실제 결과만 남기고 다음 개선안을 받아보세요.", materialTitle: "운영 기록", material: `기록 기간:\n실제 문의 수:\n실제 판매 건수:\n실제 매출:\n실제 지출:\n고객이 남긴 의견:\n계속할 일:\n바꿔볼 일:\n\n아직 모르는 항목은 비워두어도 됩니다.`, prompt: "제가 기록한 실제 운영 결과를 바탕으로 유지할 것과 바꿀 것, 다음 실험 하나를 정해 주세요. 기록하지 않은 실적은 만들지 말고 원인 추정과 확인된 결과를 구분해 주세요." });
  if (improving) {
    const website = result.find(step => step.id === "website")!;
    website.title = "홈페이지에서 개선할 곳을 찾아요";
    website.task = "기존 홈페이지의 상품 설명과 문의 흐름을 점검해요";
    website.materialTitle = "홈페이지 개선 요청서";
    website.material += "\n\n현재 홈페이지 주소:\n고객이 이용하기 어려워한 부분:\n이번에 바꾸려는 내용:";
    website.prompt = "운영 중인 사업의 홈페이지에서 상품 설명과 문의 흐름을 개선할 문구·구성을 제안해 주세요. 제공된 화면이나 내용만 근거로 삼고, 주소만 보고 사이트를 점검했다고 말하거나 실제 전환율·후기·실적을 만들지 마세요.";
    const marketing = result.find(step => step.id === "marketing")!;
    marketing.title = "홍보 결과로 다음 실험을 정해요";
    marketing.task = "지금 쓰는 채널의 실제 반응을 확인하고 바꿀 일 하나를 정해요";
    marketing.materialTitle = "홍보 개선 메모";
    marketing.material = `${context}\n\n현재 채널: ${channel}\n확인한 기간:\n실제 집행 비용:\n실제 문의와 판매:\n고객 반응:\n유지할 내용:\n다음에 바꿔볼 내용:`;
    marketing.prompt = "현재 채널과 제가 기록한 홍보 결과를 바탕으로 다음 1주일에 바꿔볼 실험 하나와 게시물 초안을 작성해 주세요. 기존 고객과 새 고객을 구별하고 확인할 지표를 정하되, 미입력 결과는 만들거나 성과를 보장하지 마세요.";
  }
  return result;
}

export function launchStatus(state: LaunchState, step: LaunchStep) {
  const record = state.records[step.id];
  if (!record) return step.decided ? "done" : "pending";
  if (record.signature !== step.signature) return "review";
  return record.status;
}

/** 견적 칸 금액: '3,000,000'·'300만'·'1억 2천만' → 원. 읽을 수 없으면 null(예전엔 숫자만 남겨 '300만'이 300원이 됐다) */
export function quoteAmount(value: string): number | null {
  const amount = parseWonAmount(value);
  return amount !== undefined && amount <= 1e12 ? amount : null;
}

export function quoteTotals(quote: LaunchState["quotes"][number]) {
  const amount = quoteAmount;
  const monthly = amount(quote.monthly), initial = amount(quote.initial), deposit = amount(quote.deposit);
  if (monthly === null || initial === null || deposit === null) return null;
  return { outflow: deposit + initial + monthly * 12, fees: initial + monthly * 12, deposit };
}
