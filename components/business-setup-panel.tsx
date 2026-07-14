"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Calculator,
  Check,
  ChevronRight,
  CircleDollarSign,
  CircleHelp,
  FileCheck2,
  Lightbulb,
  ShieldCheck,
} from "lucide-react";
import {
  archetypeLabels,
  businessArchetypes,
  emptyBusinessSetup,
  legalFormLabels,
  legalForms,
  workplaceLabels,
  workplaceTypes,
  type BusinessAssessment,
  type BusinessSetup,
} from "../lib/business/domain";
import { calculateFinancialAnalysis } from "../lib/business/financial-engine";
import { inferBusinessArchetype } from "../lib/business/router";
import {
  markSetupFieldUnknown,
  normalizeLegacyDigitalSetup,
  recommendedSetupValue,
  setupQuestionIds,
  setupQuestionLabels,
  setupValue,
  withSetupValue,
} from "../lib/business/setup-wizard";
import type { ProjectRecord } from "../lib/service-domain";

const questionCopy: Record<string, { title: string; help: string }> = {
  archetype: { title: "어떤 방식으로 돈을 버는 사업인가요?", help: "사업 유형에 따라 필요 없는 비용과 입지 질문을 자동으로 제외합니다." },
  legalForm: { title: "사업자 형태를 정했나요?", help: "아직 정하지 않았다면 ‘모르겠음’을 선택해도 다음으로 갈 수 있습니다." },
  workplaceType: { title: "사업자 주소와 일할 곳은 어떻게 할까요?", help: "온라인 서비스는 자택이나 비상주 오피스를 골라도 상권 분석을 요구하지 않습니다." },
  region: { title: "사업자등록을 할 지역은 어디인가요?", help: "상권 분석용 질문이 아닙니다. 세무서와 지원사업 지역을 구분할 때만 사용합니다." },
  employeeCount: { title: "처음부터 급여를 줄 직원이 있나요?", help: "대표자 본인은 직원 수에서 제외하세요. 혼자 시작하면 0명입니다." },
  deposit: { title: "돌려받을 임대 보증금은 얼마인가요?", help: "계약할 공간이 없다면 이 질문은 표시되지 않습니다." },
  interior: { title: "내부 공사에 얼마를 쓸까요?", help: "매장·공장처럼 실제 공간이 필요한 사업에만 묻습니다." },
  equipment: { title: "새 장비를 사는 데 얼마가 필요한가요?", help: "온라인 서비스는 기존 노트북을 쓴다고 보고 기본 0원이며 이 질문도 생략합니다." },
  initialInventory: { title: "처음 준비할 재고는 얼마인가요?", help: "상품 판매나 제조 사업에만 필요한 금액입니다." },
  licensesAndRegistration: { title: "인허가·등록 준비비는 얼마인가요?", help: "정확하지 않다면 추천값을 임시로 쓰고 나중에 관할기관에서 확인하세요." },
  launchMarketing: { title: "처음 고객을 알리는 데 얼마를 쓸까요?", help: "광고가 아니라 무료 홍보로 시작하면 0원을 입력해도 됩니다." },
  rent: { title: "매달 공간에 내는 돈은 얼마인가요?", help: "비상주 오피스라면 월 이용료만 입력하면 됩니다. 상권 점수와는 관계없습니다." },
  maintenance: { title: "매달 관리비는 얼마인가요?", help: "공간 계약서에 별도 관리비가 없다면 0원입니다." },
  payrollGross: { title: "직원에게 매달 지급할 급여 총액은 얼마인가요?", help: "직원이 여러 명이면 모두 합친 세전 급여를 입력하세요." },
  accounting: { title: "세무·회계에 매달 얼마를 쓸까요?", help: "직접 신고할 계획이면 0원으로 시작할 수 있습니다." },
  software: { title: "서버와 소프트웨어에 매달 얼마가 드나요?", help: "호스팅, 업무 도구, 인공지능 API처럼 매달 결제되는 비용을 합쳐주세요." },
  utilitiesAndTelecom: { title: "전기·통신비는 매달 얼마인가요?", help: "매장·공장 등 별도 공간에서 추가로 나가는 금액만 입력합니다." },
  fixedMarketing: { title: "매달 홍보에 얼마를 쓸까요?", help: "무료 콘텐츠와 직접 영업만 할 계획이면 0원도 괜찮습니다." },
  sellingPrice: { title: "고객 한 명에게 얼마를 받을까요?", help: "월 구독이라면 월 구독료, 1회 서비스라면 1회 가격을 입력하세요." },
  targetMonthlyUnits: { title: "한 달에 고객 몇 명을 목표로 할까요?", help: "처음 3개월 동안 현실적으로 받을 수 있는 고객 수를 입력하세요." },
  materialsOrPurchase: { title: "한 건을 팔 때 상품·재료비가 얼마인가요?", help: "상품 매입이나 제조 재료가 없다면 0원입니다." },
  packaging: { title: "한 건당 포장비는 얼마인가요?", help: "디지털 상품에는 표시되지 않는 질문입니다." },
  shipping: { title: "한 건당 배송비는 얼마인가요?", help: "고객이 배송비를 따로 내더라도 실제 지출액을 입력하세요." },
  laborPerUnit: { title: "고객 한 명을 처리할 때 외주·작업비가 드나요?", help: "자동 제공되는 온라인 서비스라면 0원으로 두어도 됩니다." },
};

const moneyQuestionIds = new Set([
  "deposit", "interior", "equipment", "initialInventory", "licensesAndRegistration", "launchMarketing",
  "rent", "maintenance", "payrollGross", "accounting", "software", "utilitiesAndTelecom", "fixedMarketing",
  "sellingPrice", "materialsOrPurchase", "packaging", "shipping", "laborPerUnit",
]);

function won(value: number | null) {
  return value === null ? "계산 불가" : `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function numberText(value: string | number) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)).toLocaleString("ko-KR") : "0";
}

export function BusinessSetupPanel({
  project,
  onSaved,
  onComplete,
}: {
  project: ProjectRecord;
  onSaved: (project: ProjectRecord) => void;
  onComplete?: () => void;
}) {
  const suggested = inferBusinessArchetype(project.opportunity);
  const initialBudgetWon = typeof project.stages[0]?.inputs.budgetWon === "number" ? project.stages[0].inputs.budgetWon : null;
  const initialState = useMemo(() => {
    const base = project.businessSetup ? { ...project.businessSetup, unknownFields: project.businessSetup.unknownFields ?? [] } : emptyBusinessSetup(suggested);
    if (!project.businessSetup) {
      base.sectorKeywords = [String(project.opportunity.sector ?? ""), String(project.opportunity.title ?? "")].filter(Boolean);
      if (initialBudgetWon !== null) base.financial.availableCash = initialBudgetWon;
    }
    return normalizeLegacyDigitalSetup(base);
  }, [initialBudgetWon, project.businessSetup, project.opportunity.sector, project.opportunity.title, suggested]);
  const [setup, setSetup] = useState<BusinessSetup>(initialState.setup);
  const [assessment, setAssessment] = useState<BusinessAssessment | null>(initialState.adjusted ? null : project.businessAssessment);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [showResult, setShowResult] = useState(Boolean(project.businessAssessment) && !initialState.adjusted);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const questions = setupQuestionIds(setup);
  const safeIndex = Math.min(questionIndex, Math.max(0, questions.length - 1));
  const questionId = questions[safeIndex];
  const question = questionCopy[questionId];
  const currentValue = setupValue(setup, questionId);
  const recommended = questionId === "archetype" ? suggested : questionId === "region" ? (setup.region || "지역 미정") : recommendedSetupValue(setup, questionId);
  const preview = useMemo(() => calculateFinancialAnalysis(setup.financial), [setup.financial]);
  const fundingDifference = assessment ? setup.financial.availableCash - assessment.financial.totalFundingNeed : 0;

  const applyValue = (id: string, value: string | number, unknown = false) => {
    setSetup((current) => markSetupFieldUnknown(withSetupValue(current, id, value), id, unknown));
  };

  const save = async (override?: BusinessSetup) => {
    const target = override ?? setup;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${project.id}/setup`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(target),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "분석을 저장하지 못했습니다.");
      setSetup(payload.project.businessSetup);
      setAssessment(payload.assessment);
      setShowResult(true);
      onSaved(payload.project);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "분석 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const next = () => {
    if (safeIndex >= questions.length - 1) void save();
    else setQuestionIndex(safeIndex + 1);
  };

  const useUnknown = () => {
    const nextSetup = markSetupFieldUnknown(withSetupValue(setup, questionId, recommended), questionId, true);
    setSetup(nextSetup);
    if (safeIndex >= questions.length - 1) void save(nextSetup);
    else setQuestionIndex(safeIndex + 1);
  };

  const choiceOptions = questionId === "archetype"
    ? businessArchetypes.map((value) => ({ value, label: archetypeLabels[value] }))
    : questionId === "legalForm"
      ? legalForms.map((value) => ({ value, label: legalFormLabels[value] }))
      : questionId === "workplaceType"
        ? workplaceTypes.filter((value) => setup.archetype !== "digital_service" || value !== "factory").map((value) => ({ value, label: workplaceLabels[value] }))
        : [];

  if (showResult && assessment) {
    const unknownLabels = setup.unknownFields.map((id) => setupQuestionLabels[id] ?? id);
    return (
      <section className="business-setup-panel setup-wizard-panel">
        <header><div><span><Calculator /></span><div><small>손익 계산 완료</small><h3>이 사업에 맞는 손익분기점</h3><p>입력한 값과 추천값을 구분해 계산했습니다.</p></div></div><em><Check /> 저장됨</em></header>
        <div className="setup-step-content result">
          {unknownLabels.length > 0 && <div className="setup-unknown-summary"><CircleHelp /><p><strong>모르겠음으로 계산한 항목 {unknownLabels.length}개</strong><span>{unknownLabels.join(" · ")}</span><small>추천값으로 임시 계산했으며 나중에 실제 금액으로 바꿀 수 있습니다.</small></p></div>}
          <div className="financial-result-hero">
            <div><small>월 손익분기점</small><strong>{won(assessment.financial.breakEvenRevenue)}</strong><span>{assessment.financial.breakEvenUnits === null ? "판매 구조 수정 필요" : `월 ${assessment.financial.breakEvenUnits.toLocaleString("ko-KR")}건 판매`}</span></div>
            <div><small>총 필요자금</small><strong>{won(assessment.financial.totalFundingNeed)}</strong><span>초기 투자 + {setup.financial.workingCapitalMonths}개월 운영비</span></div>
          </div>
          <div className={`funding-comparison ${fundingDifference < 0 ? "shortage" : "enough"}`}>
            <div><small>처음 입력한 시작 예산</small><strong>{won(setup.financial.availableCash)}</strong></div>
            <div><small>{fundingDifference < 0 ? "현재 부족한 금액" : "필요자금 제외 후 남는 금액"}</small><strong>{won(Math.abs(fundingDifference))}</strong></div>
            <p>{fundingDifference < 0 ? "추천값이 포함된 임시 계산입니다. 실제 견적을 확인하면서 비용을 줄여보세요." : "현재 입력 기준으로는 시작 예산 안에서 준비할 수 있습니다."}</p>
          </div>
          <div className="financial-result-grid">
            <article><small>고객당 남는 금액</small><strong>{won(assessment.financial.contributionPerUnit)}</strong><span>판매가에서 건당 비용 제외</span></article>
            <article><small>월 고정비</small><strong>{won(assessment.financial.monthlyFixedCost)}</strong><span>매출이 없어도 나가는 돈</span></article>
            <article><small>목표 고객 달성 시 월 이익</small><strong className={assessment.financial.targetMonthlyOperatingProfit < 0 ? "negative" : ""}>{won(assessment.financial.targetMonthlyOperatingProfit)}</strong><span>소득세·법인세 전</span></article>
            <article><small>매출 없이 버틸 수 있는 기간</small><strong>{assessment.financial.runwayMonths === null ? "제한 없음" : `${assessment.financial.runwayMonths}개월`}</strong><span>현재 시작 예산 기준</span></article>
          </div>
          {assessment.financial.warnings.length > 0 && <div className="financial-warnings"><strong><AlertTriangle /> 먼저 확인할 숫자</strong>{assessment.financial.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>}
          <div className="compliance-summary"><div><FileCheck2 /><p><strong>한국 개업 준비 체크</strong><span>필수 {assessment.requiredCount}개 · 진행 차단 {assessment.hardBlockCount}개</span></p></div>{assessment.requirements.map((item) => <details key={item.id} className={item.severity}><summary><span>{item.severity === "blocked" ? "진행 전 확인" : item.severity === "required" ? "필수" : "확인"}</span><strong>{item.title}</strong><ChevronRight /></summary><div><p>{item.reason}</p><ol>{item.actions.map((action) => <li key={action}>{action}</li>)}</ol><a href={item.sourceUrl} target="_blank" rel="noreferrer">{item.authority} 공식 안내 확인</a></div></details>)}</div>
          <div className="calculation-caveat"><ShieldCheck /><p><strong>자동 계산 안내</strong>모르겠음으로 둔 항목은 추천값을 넣어 계산했습니다. 실제 계약·견적을 확인한 뒤 언제든 수정할 수 있습니다.</p></div>
        </div>
        {error && <div className="setup-error"><AlertTriangle /> {error}</div>}
        <footer className="setup-result-actions"><button onClick={() => { setShowResult(false); setQuestionIndex(0); }}><ArrowLeft /> 금액 다시 입력</button><button className="save-setup" onClick={onComplete}>계산 확인 완료 · 다음으로 <ChevronRight /></button></footer>
      </section>
    );
  }

  return (
    <section className="business-setup-panel setup-wizard-panel">
      <header><div><span><Calculator /></span><div><small>손익분기점 설정</small><h3>한 번에 하나씩 알려주세요</h3><p>모르는 값은 추천값으로 넘기고 나중에 수정할 수 있습니다.</p></div></div>{initialState.adjusted && <em>온라인 사업 비용 정리됨</em>}</header>
      <div className="setup-wizard-progress" aria-label={`전체 ${questions.length}개 중 ${safeIndex + 1}번째 질문`}><span>{safeIndex + 1} / {questions.length}</span><i><b style={{ width: `${((safeIndex + 1) / questions.length) * 100}%` }} /></i></div>
      <div className="setup-wizard-question" key={questionId}>
        <div className="setup-question-heading"><span>{setupQuestionLabels[questionId]}</span><h4>{question.title}</h4><p>{question.help}</p></div>
        {choiceOptions.length > 0 ? <div className="setup-choice-grid">{choiceOptions.map((option) => <button type="button" key={option.value} className={String(currentValue) === option.value ? "active" : ""} onClick={() => applyValue(questionId, option.value)}><span>{String(currentValue) === option.value ? <Check /> : null}</span><strong>{option.label}</strong>{String(recommended) === option.value && <small>추천</small>}</button>)}</div>
          : questionId === "region" ? <label className="setup-wizard-text"><span>지역 입력</span><input autoFocus value={String(currentValue)} onChange={(event) => applyValue(questionId, event.target.value)} placeholder="예: 서울특별시 마포구" /></label>
            : <label className="setup-wizard-number"><span>금액 또는 수량</span><div><input autoFocus inputMode="numeric" value={numberText(currentValue)} onChange={(event) => applyValue(questionId, Number(event.target.value.replace(/[^0-9]/g, "")) || 0)} /><em>{moneyQuestionIds.has(questionId) ? "원" : questionId === "employeeCount" ? "명" : "건"}</em></div><small>{moneyQuestionIds.has(questionId) ? `${numberText(currentValue)}원` : `${numberText(currentValue)}${questionId === "employeeCount" ? "명" : "건"}`}</small></label>}
        <div className="setup-recommendation"><Lightbulb /><p><span>추천값</span><strong>{moneyQuestionIds.has(questionId) ? `${numberText(recommended)}원` : questionId === "employeeCount" || questionId === "targetMonthlyUnits" ? `${numberText(recommended)}${questionId === "employeeCount" ? "명" : "건"}` : choiceOptions.find((option) => option.value === String(recommended))?.label ?? String(recommended)}</strong></p><button type="button" onClick={() => applyValue(questionId, recommended)}>추천값 쓰기</button></div>
        {setup.unknownFields.includes(questionId) && <div className="setup-unknown-active"><CircleHelp /> 현재 추천값을 사용한 ‘모르겠음’ 항목입니다.</div>}
      </div>
      {error && <div className="setup-error"><AlertTriangle /> {error}</div>}
      <div className="setup-live-total"><span>현재까지 계산된 필요자금</span><strong>{won(preview.totalFundingNeed)}</strong><small>처음 입력한 예산 {won(setup.financial.availableCash)}</small></div>
      <footer className="setup-wizard-actions"><button onClick={() => setQuestionIndex(Math.max(0, safeIndex - 1))} disabled={saving || safeIndex === 0}><ArrowLeft /> 이전</button><button className="setup-unknown-button" onClick={useUnknown} disabled={saving}><CircleHelp /> 모르겠음으로 다음</button><button className="next-setup" onClick={next} disabled={saving}>{saving ? "계산 중..." : safeIndex === questions.length - 1 ? <><CircleDollarSign /> 손익 계산하기</> : <>다음 <ChevronRight /></>}</button></footer>
    </section>
  );
}
