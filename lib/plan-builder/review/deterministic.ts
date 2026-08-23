/*
 * 코드가 이미 확실히 아는 문제 — Reviewer LLM 이 추측할 필요가 없는 것들.
 *
 * 정합성 검사·재무 계산·capacity·맥락 충돌은 전부 기존 엔진이 판정한다.
 * 여기서는 그 결과를 ReviewIssue 모양으로 옮기기만 한다. 숫자를 새로 만들지 않는다.
 *
 * 이 목록은 Reviewer 프롬프트에도 그대로 들어간다 — LLM 이 "문제 없어 보인다"고
 * 뒤집지 못하게 하고, 같은 문제를 또 만들어 중복시키지 않게 하기 위해서다.
 */
import { findConsistencyIssues, type ConsistencyIssue } from "../consistency";
import { calculateFinancials, collectFinancialInputs, parseAmount, type FinancialInputs, type FinancialResult } from "../financials";
import { buildPlanBusinessContext, type PlanBusinessContext } from "../context/build";
import type { MarketEvidence } from "../../market/domain";
import type { ReviewIssue } from "./domain";

type Answers = Record<string, Record<string, unknown>>;
type Business = { name?: string; description?: string; industry?: string; region?: string; stage?: string };

export interface DeterministicInput {
  answers: Answers;
  business: Business;
  evidence: MarketEvidence[];
}

export interface DeterministicResult {
  issues: ReviewIssue[];
  context: PlanBusinessContext;
  financials: FinancialResult | null;
  financialInputs: FinancialInputs;
  consistency: ConsistencyIssue[];
  /** 운영 능력 상한 — 사용자가 답한 값에서만 나온다 */
  capacity: { value: number; basis: string } | null;
}

function won(n: number): string {
  return `${Math.round(n).toLocaleString("ko-KR")}원`;
}

/**
 * 확인된 운영 상한.
 *  1) 재무 입력의 monthlyCapacity (사용자가 '월 판매 한계'를 서술한 경우)
 *  2) 클래스 팩: 회당 정원 × 월 수업 횟수 (둘 다 confirmed 일 때만)
 * 추정값에서는 만들지 않는다.
 */
function findCapacity(ctx: PlanBusinessContext, inputs: FinancialInputs): DeterministicResult["capacity"] {
  if (inputs.monthlyCapacity && inputs.monthlyCapacity > 0) {
    return { value: inputs.monthlyCapacity, basis: "사용자가 답한 월 판매 한계" };
  }
  const num = (id: string) => {
    const m = ctx.metrics.find((x) => x.id === id);
    return m ? parseAmount(m.value) : undefined;
  };
  const seats = num("seatsPerClass");
  const classes = num("classesPerMonth");
  if (seats && classes) {
    return { value: seats * classes, basis: `회당 정원 ${seats}명 × 월 수업 횟수 ${classes}회` };
  }
  return null;
}

export function collectDeterministic(input: DeterministicInput): DeterministicResult {
  const answers = input.answers ?? {};
  const context = buildPlanBusinessContext({ business: input.business, answers });
  const { inputs } = collectFinancialInputs(answers);
  const calc = calculateFinancials(inputs);
  const financials = calc.unit || calc.breakEven || calc.monthly.length ? calc : null;
  const consistency = findConsistencyIssues(answers, input.business);
  const capacity = findCapacity(context, inputs);

  const issues: ReviewIssue[] = [];
  let n = 0;
  const push = (i: Omit<ReviewIssue, "id" | "origin">) => {
    n += 1;
    issues.push({ ...i, id: `det-${n}`, origin: "deterministic" });
  };

  /* ── 재무 ── */
  const unit = calc.unit;
  if (unit && unit.contributionMargin <= 0) {
    push({
      severity: "critical",
      category: "finance",
      sectionKey: "financials/revenue",
      title: "한 건 팔수록 손해가 나는 가격 구조입니다",
      problem: `판매가 ${won(unit.unitPrice)}에서 변동비 ${won(unit.unitVariableCost)}를 빼면 건당 공헌이익이 ${won(unit.contributionMargin)}입니다. 많이 팔수록 손실이 커집니다.`,
      whyItMatters: "이 구조에서는 판매량을 아무리 늘려도 고정비를 회수할 수 없어, 매출 목표나 손익분기 계획이 성립하지 않습니다.",
      evidence: [`판매가 ${won(unit.unitPrice)}`, `1건당 변동비 ${won(unit.unitVariableCost)}`, `건당 공헌이익 ${won(unit.contributionMargin)}`],
      recommendation: "판매가를 올리거나 1건당 변동비 구성(재료·수수료·포장·배송)을 다시 확인해 주세요. 변동비에 고정비 항목이 잘못 섞여 있지 않은지도 함께 보시면 좋습니다.",
      requiresUserInput: true,
      autoFixable: false,
    });
  }

  const be = calc.breakEven;
  const volume = inputs.startingVolume;
  if (be && volume && volume > 0) {
    const ratio = be.units / volume;
    if (ratio > 1) {
      push({
        severity: ratio >= 2 ? "critical" : "warning",
        category: "finance",
        sectionKey: "financials/revenue",
        title: "손익분기 판매량이 목표 판매량보다 많습니다",
        problem: `손익분기는 월 ${be.units.toLocaleString("ko-KR")}건인데 계획한 월 판매량은 ${volume.toLocaleString("ko-KR")}건입니다. 계획대로 팔아도 매달 적자입니다.`,
        whyItMatters: "목표를 100% 달성해도 적자라면, 이 계획서는 사업이 유지되는 조건을 보여 주지 못합니다.",
        evidence: [`손익분기 월 ${be.units.toLocaleString("ko-KR")}건 (매출 ${won(be.revenue)})`, `계획한 월 판매량 ${volume.toLocaleString("ko-KR")}건`],
        recommendation: "고정비를 줄이거나, 판매가·판매량 계획을 다시 잡아 주세요. 목표 판매량이 보수적으로 잡힌 것이라면 그 근거를 본문에 함께 적는 편이 좋습니다.",
        requiresUserInput: true,
        autoFixable: false,
      });
    }
  }

  /* ── 운영 capacity ── */
  if (capacity && volume && volume > capacity.value) {
    push({
      severity: "critical",
      category: "operation",
      sectionKey: "strategy/distribution",
      title: "목표 판매량이 확인된 운영 능력을 넘습니다",
      problem: `계획한 월 판매량은 ${volume.toLocaleString("ko-KR")}건인데, 확인된 운영 상한은 월 ${capacity.value.toLocaleString("ko-KR")}건(${capacity.basis})입니다.`,
      whyItMatters: "물리적으로 처리할 수 없는 판매량 위에 매출·손익 계획이 세워지면 계획서 전체 숫자가 무너집니다.",
      evidence: [`운영 상한 월 ${capacity.value.toLocaleString("ko-KR")}건 — ${capacity.basis}`, `계획한 월 판매량 ${volume.toLocaleString("ko-KR")}건`],
      recommendation: "정원·운영 횟수를 늘릴 계획이라면 그 계획(추가 인력·공간·시간)을 본문에 적고, 그렇지 않다면 목표 판매량을 운영 상한 안으로 조정해 주세요.",
      requiresUserInput: true,
      autoFixable: false,
    });
  }

  /* ── 자금 ── */
  const investment = inputs.initialInvestment ?? 0;
  const needsFunding = context.funding.needs?.value;
  const fundingAmount = context.funding.amount?.value;
  if (investment > 0 && !needsFunding && !fundingAmount) {
    push({
      severity: "warning",
      category: "finance",
      sectionKey: "funding/requirements",
      title: "초기 투자 금액은 있는데 조달 계획이 없습니다",
      problem: `초기 투자로 ${won(investment)}가 필요하다고 적혀 있지만, 이 돈을 어떻게 마련할지에 대한 답변이 없습니다.`,
      whyItMatters: "필요한 돈과 마련할 방법이 이어지지 않으면 계획서를 읽는 사람이 실행 가능성을 판단할 수 없습니다.",
      evidence: [`초기 투자 ${won(investment)}`, "자금 소요 섹션에 조달 관련 답변 없음"],
      recommendation: "자기자금·대출·지원사업 중 어디서 얼마를 마련할 계획인지 '자금 소요' 섹션에 적어 주세요.",
      requiresUserInput: true,
      autoFixable: false,
    });
  }

  /* ── 마케팅 ── */
  const hasVolumeGoal = Boolean(volume && volume > 0);
  const channels = context.marketing.channels?.value ?? [];
  const promoBudget = context.marketing.budget?.value;
  if (hasVolumeGoal && channels.length === 0 && !promoBudget) {
    push({
      severity: "warning",
      category: "marketing",
      sectionKey: "strategy/promotion",
      title: "판매 목표는 있는데 고객을 데려올 방법이 없습니다",
      problem: `월 ${volume!.toLocaleString("ko-KR")}건을 팔겠다는 목표는 있지만, 홍보 채널과 홍보 예산이 모두 비어 있습니다.`,
      whyItMatters: "고객 확보 경로가 없으면 판매 목표는 근거 없는 숫자가 됩니다.",
      evidence: [`계획한 월 판매량 ${volume!.toLocaleString("ko-KR")}건`, "홍보 채널·홍보 예산 답변 없음"],
      recommendation: "고객이 실제로 있는 곳 한두 곳을 정하고, 거기에 매달 얼마를 쓸지 '홍보 전략' 섹션에 적어 주세요.",
      requiresUserInput: true,
      autoFixable: false,
    });
  }

  /* ── 정합성 검사 (기존 엔진) ── */
  for (const c of consistency) {
    push({
      severity: c.severity === "conflict" ? "critical" : "warning",
      category: "consistency",
      ...(c.refs[0]?.key ? { sectionKey: c.refs[0].key } : {}),
      title: c.title,
      problem: c.detail,
      whyItMatters: "같은 사실이 문서 안에서 다르게 적혀 있으면 어느 쪽이 맞는지 알 수 없어 계획서 전체의 신뢰가 떨어집니다.",
      evidence: c.refs.map((r) => r.label),
      recommendation: "두 값 중 맞는 쪽으로 답변을 맞춰 주세요. 둘 다 맞다면(예: 상품별 가격이 다름) 본문에서 구분해 적어야 합니다.",
      requiresUserInput: true,
      autoFixable: false,
    });
  }

  /* ── 맥락 충돌 (위저드 답 ↔ AI 분석 확인값) ── */
  for (const c of context.conflicts) {
    push({
      severity: "warning",
      category: "consistency",
      title: c.title,
      problem: c.detail,
      whyItMatters: "같은 항목이 두 값으로 남아 있으면 이후 섹션마다 다른 쪽을 인용해 문서가 흔들립니다.",
      evidence: [c.detail],
      recommendation: "둘 중 실제로 쓸 표현을 하나 정해 주세요.",
      requiresUserInput: true,
      autoFixable: false,
    });
  }

  /* ── 아직 정하지 않은 항목 ── */
  if (context.unknowns.length) {
    push({
      severity: "improvement",
      category: "business_model",
      title: `아직 정하지 않은 항목이 ${context.unknowns.length}개 있습니다`,
      problem: `${context.unknowns.map((u) => u.label).join(", ")} 가 '아직 모르겠어요' 또는 미입력 상태입니다.`,
      whyItMatters: "이 값들이 비어 있는 동안에는 관련 섹션이 '추가 정의 필요'로만 서술되어 계획서의 설득력이 약해집니다.",
      evidence: context.unknowns.map((u) => u.label),
      recommendation: "정해지는 대로 해당 질문에 답을 채워 주세요. 지금 정할 수 없다면 언제·무엇을 보고 정할지를 본문에 적어 두는 것만으로도 문서가 단단해집니다.",
      requiresUserInput: true,
      autoFixable: false,
    });
  }

  /* ── 시장 근거 ── */
  if (input.evidence.length === 0) {
    push({
      severity: "improvement",
      category: "market_evidence",
      sectionKey: "market/segments",
      title: "공식 시장 근거가 아직 붙어 있지 않습니다",
      problem: "이 계획서에는 공공기관 통계 등 외부 근거가 한 건도 연결되어 있지 않습니다.",
      whyItMatters: "시장에 대한 서술이 전부 창업자의 추정으로만 남으면, 읽는 사람이 시장의 크기와 성격을 확인할 방법이 없습니다.",
      evidence: ["연결된 공식 근거 0건"],
      recommendation: "플랜 개요의 '공식 시장자료 찾기'로 관련 통계를 한 번 검색해 붙여 주세요.",
      requiresUserInput: false,
      autoFixable: false,
    });
  }

  return { issues, context, financials, financialInputs: inputs, consistency, capacity };
}
