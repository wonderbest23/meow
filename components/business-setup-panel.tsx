"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  Calculator,
  Check,
  ChevronRight,
  CircleDollarSign,
  FileCheck2,
  Landmark,
  MapPin,
  Save,
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
import type { ProjectRecord } from "../lib/service-domain";

type SetupStep = "basic" | "initial" | "fixed" | "variable" | "result";

const steps: { id: SetupStep; label: string }[] = [
  { id: "basic", label: "사업 조건" },
  { id: "initial", label: "초기비용" },
  { id: "fixed", label: "월 고정비" },
  { id: "variable", label: "판매·변동비" },
  { id: "result", label: "손익분기 결과" },
];

const initialCostFields = [
  ["deposit", "임대 보증금"],
  ["keyMoney", "권리금"],
  ["brokerage", "중개보수"],
  ["interior", "내부 공사"],
  ["equipment", "장비·집기"],
  ["initialInventory", "초도 재고"],
  ["licensesAndRegistration", "인허가·등록"],
  ["launchMarketing", "영업 시작 홍보비"],
  ["contingency", "예비비"],
  ["other", "기타 초기비용"],
] as const;

const fixedCostFields = [
  ["rent", "월 임대료"],
  ["maintenance", "관리비"],
  ["payrollGross", "월 급여 총액"],
  ["accounting", "세무·회계"],
  ["software", "소프트웨어·구독"],
  ["utilitiesAndTelecom", "전기·통신·공과금"],
  ["businessInsurance", "사업 보험"],
  ["fixedMarketing", "매달 홍보비"],
  ["loanInterest", "대출 이자"],
  ["depreciation", "월 감가상각비"],
  ["other", "기타 고정비"],
] as const;

const variableCostFields = [
  ["materialsOrPurchase", "상품 매입·재료비"],
  ["packaging", "포장비"],
  ["shipping", "배송비"],
  ["laborPerUnit", "건당 작업 인건비"],
  ["otherPerUnit", "기타 건당 비용"],
] as const;

const rateFields = [
  ["pgFeeRate", "온라인 결제·카드 수수료율"],
  ["platformFeeRate", "중개 서비스 수수료율"],
  ["returnAndWasteRate", "반품·폐기 예상률"],
] as const;

function won(value: number | null) {
  return value === null ? "계산 불가" : `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function NumberField({
  label,
  value,
  onChange,
  suffix = "원",
  hint,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  suffix?: string;
  hint?: string;
}) {
  return (
    <label className="setup-number-field">
      <span>{label}</span>
      <div><input type="number" min="0" value={value} onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))} /><em>{suffix}</em></div>
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function BusinessSetupPanel({
  project,
  onSaved,
}: {
  project: ProjectRecord;
  onSaved: (project: ProjectRecord) => void;
}) {
  const suggested = inferBusinessArchetype(project.opportunity);
  const initialBudgetWon = typeof project.stages[0]?.inputs.budgetWon === "number"
    ? project.stages[0].inputs.budgetWon
    : null;
  const [setup, setSetup] = useState<BusinessSetup>(() => {
    if (project.businessSetup) return project.businessSetup;
    const blank = emptyBusinessSetup(suggested);
    blank.sectorKeywords = [
      String(project.opportunity.sector ?? ""),
      String(project.opportunity.title ?? ""),
    ].filter(Boolean);
    if (initialBudgetWon !== null) blank.financial.availableCash = initialBudgetWon;
    return blank;
  });
  const [assessment, setAssessment] = useState<BusinessAssessment | null>(
    project.businessAssessment,
  );
  const [step, setStep] = useState<SetupStep>(
    project.businessAssessment ? "result" : "basic",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const preview = useMemo(
    () => calculateFinancialAnalysis(setup.financial),
    [setup.financial],
  );
  const fundingDifference = assessment
    ? setup.financial.availableCash - assessment.financial.totalFundingNeed
    : 0;

  const stepIndex = steps.findIndex((item) => item.id === step);
  const next = () => setStep(steps[Math.min(steps.length - 1, stepIndex + 1)].id);
  const previous = () => setStep(steps[Math.max(0, stepIndex - 1)].id);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${project.id}/setup`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(setup),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "분석을 저장하지 못했습니다.");
      setAssessment(payload.assessment);
      onSaved(payload.project);
      setStep("result");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "분석 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="business-setup-panel">
      <header>
        <div><span><Calculator /></span><div><small>한국 사업 조건 확인</small><h3>실제 개업 조건과 손익분기점 설정</h3><p>추측값을 그대로 승인하지 않도록 비용·사업장·필수 절차를 먼저 확인합니다.</p></div></div>
        {assessment && <em><Check /> 분석 저장됨</em>}
      </header>

      <nav className="setup-step-nav" aria-label="사업 설정 단계">
        {steps.map((item, index) => <button key={item.id} className={step === item.id ? "active" : index < stepIndex ? "done" : ""} onClick={() => setStep(item.id)}><span>{index < stepIndex ? <Check /> : index + 1}</span><strong>{item.label}</strong></button>)}
      </nav>

      {step === "basic" && (
        <div className="setup-step-content">
          <div className="setup-heading"><Building2 /><div><strong>어떤 방식으로 시작하나요?</strong><p>사업 유형에 따라 비용과 등록·인허가 절차가 달라집니다.</p></div></div>
          <div className="setup-form-grid">
            <label><span>사업 유형</span><select value={setup.archetype} onChange={(event) => { const archetype = event.target.value as BusinessSetup["archetype"]; setSetup((current) => ({ ...current, archetype })); }}>{businessArchetypes.map((item) => <option key={item} value={item}>{archetypeLabels[item]}</option>)}</select><small>추천 유형: {archetypeLabels[suggested]}</small></label>
            <label><span>사업자 형태</span><select value={setup.legalForm} onChange={(event) => setSetup((current) => ({ ...current, legalForm: event.target.value as BusinessSetup["legalForm"] }))}>{legalForms.map((item) => <option key={item} value={item}>{legalFormLabels[item]}</option>)}</select></label>
            <label><span>사업장 형태</span><select value={setup.workplaceType} onChange={(event) => setSetup((current) => ({ ...current, workplaceType: event.target.value as BusinessSetup["workplaceType"] }))}>{workplaceTypes.map((item) => <option key={item} value={item}>{workplaceLabels[item]}</option>)}</select></label>
            <label><span>사업 지역</span><input value={setup.region} onChange={(event) => setSetup((current) => ({ ...current, region: event.target.value }))} placeholder="예: 서울특별시 마포구" /></label>
            <label className="wide"><span>검토할 업종 키워드</span><input value={setup.sectorKeywords.join(", ")} onChange={(event) => setSetup((current) => ({ ...current, sectorKeywords: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) }))} placeholder="예: 온라인 교육, 식품, 카페" /><small>쉼표로 구분합니다. 인허가 위험을 자동 판정할 때 사용합니다.</small></label>
            <NumberField label="예상 직원 수" value={setup.employeeCount} suffix="명" onChange={(value) => setSetup((current) => ({ ...current, employeeCount: Math.round(value) }))} />
          </div>
          <div className="setup-checks">
            <label><input type="checkbox" checked={setup.onlineSales} onChange={(event) => setSetup((current) => ({ ...current, onlineSales: event.target.checked }))} /><span><strong>온라인에서 결제·판매</strong><small>통신판매·환불 정책을 확인합니다.</small></span></label>
            <label><input type="checkbox" checked={setup.handlesPersonalData} onChange={(event) => setSetup((current) => ({ ...current, handlesPersonalData: event.target.checked }))} /><span><strong>고객 개인정보 수집</strong><small>문의폼·회원·예약도 포함합니다.</small></span></label>
            <label><input type="checkbox" checked={setup.importsOrExports} onChange={(event) => setSetup((current) => ({ ...current, importsOrExports: event.target.checked }))} /><span><strong>수출입 예정</strong><small>통관·관세·제품 인증을 확인합니다.</small></span></label>
          </div>
        </div>
      )}

      {step === "initial" && (
        <div className="setup-step-content">
          <div className="setup-heading"><Landmark /><div><strong>문을 열기 전 한 번 들어가는 돈</strong><p>보증금과 권리금은 비용과 회수 가능한 자금을 구분해 기록합니다.</p></div></div>
          <div className="cost-field-grid">
            {initialCostFields.map(([key, label]) => <NumberField key={key} label={label} value={setup.financial.initial[key]} onChange={(value) => setSetup((current) => ({ ...current, financial: { ...current.financial, initial: { ...current.financial.initial, [key]: value } } }))} />)}
          </div>
          <div className="inline-total"><span>예상 초기 투자비</span><strong>{won(preview.initialInvestment)}</strong></div>
        </div>
      )}

      {step === "fixed" && (
        <div className="setup-step-content">
          <div className="setup-heading"><MapPin /><div><strong>매출이 없어도 매월 나가는 돈</strong><p>대표자 생활비는 사업 고정비와 분리하고, 직원 급여에는 사업주 부담분을 더합니다.</p></div></div>
          <div className="cost-field-grid">
            {fixedCostFields.map(([key, label]) => <NumberField key={key} label={label} value={setup.financial.monthlyFixed[key]} onChange={(value) => setSetup((current) => ({ ...current, financial: { ...current.financial, monthlyFixed: { ...current.financial.monthlyFixed, [key]: value } } }))} />)}
            <NumberField label="사업주 부담 보험료율" suffix="%" value={setup.financial.monthlyFixed.employerInsuranceRate} onChange={(value) => setSetup((current) => ({ ...current, financial: { ...current.financial, monthlyFixed: { ...current.financial.monthlyFixed, employerInsuranceRate: value } } }))} hint="실제 가입 대상과 요율은 4대보험 기관에서 확인해야 합니다." />
          </div>
          <div className="inline-total"><span>예상 월 고정비</span><strong>{won(preview.monthlyFixedCost)}</strong></div>
        </div>
      )}

      {step === "variable" && (
        <div className="setup-step-content">
          <div className="setup-heading"><CircleDollarSign /><div><strong>한 건을 팔 때마다 드는 돈</strong><p>부가세와 결제 수수료를 빼고 실제 남는 공헌이익을 계산합니다.</p></div></div>
          <div className="cost-field-grid">
            <NumberField label="고객 판매가" value={setup.financial.sellingPrice} onChange={(value) => setSetup((current) => ({ ...current, financial: { ...current.financial, sellingPrice: value } }))} />
            <NumberField label="월 목표 판매량" suffix="건" value={setup.financial.targetMonthlyUnits} onChange={(value) => setSetup((current) => ({ ...current, financial: { ...current.financial, targetMonthlyUnits: Math.round(value) } }))} />
            {variableCostFields.map(([key, label]) => <NumberField key={key} label={label} value={setup.financial.unitVariable[key]} onChange={(value) => setSetup((current) => ({ ...current, financial: { ...current.financial, unitVariable: { ...current.financial.unitVariable, [key]: value } } }))} />)}
            {rateFields.map(([key, label]) => <NumberField key={key} label={label} suffix="%" value={setup.financial.unitVariable[key]} onChange={(value) => setSetup((current) => ({ ...current, financial: { ...current.financial, unitVariable: { ...current.financial.unitVariable, [key]: value } } }))} />)}
            <NumberField label="현재 가용자금" value={setup.financial.availableCash} onChange={(value) => setSetup((current) => ({ ...current, financial: { ...current.financial, availableCash: value } }))} />
            <NumberField label="확보할 운전자금 기간" suffix="개월" value={setup.financial.workingCapitalMonths} onChange={(value) => setSetup((current) => ({ ...current, financial: { ...current.financial, workingCapitalMonths: value } }))} />
          </div>
          <div className="setup-checks compact">
            <label><input type="checkbox" checked={setup.financial.vatTaxable} onChange={(event) => setSetup((current) => ({ ...current, financial: { ...current.financial, vatTaxable: event.target.checked } }))} /><span><strong>부가세 과세 대상</strong></span></label>
            <label><input type="checkbox" checked={setup.financial.priceIncludesVat} onChange={(event) => setSetup((current) => ({ ...current, financial: { ...current.financial, priceIncludesVat: event.target.checked } }))} /><span><strong>판매가에 부가세 포함</strong></span></label>
          </div>
        </div>
      )}

      {step === "result" && (
        <div className="setup-step-content result">
          {!assessment ? (
            <div className="setup-empty-result"><Calculator /><strong>분석을 저장하면 실제 결과가 표시됩니다.</strong><button onClick={save} disabled={saving}>{saving ? "분석 중..." : "지금 분석하기"}</button></div>
          ) : (
            <>
              <div className="financial-result-hero">
                <div><small>월 손익분기점</small><strong>{won(assessment.financial.breakEvenRevenue)}</strong><span>{assessment.financial.breakEvenUnits === null ? "판매 구조 수정 필요" : `월 ${assessment.financial.breakEvenUnits.toLocaleString("ko-KR")}건 판매`}</span></div>
                <div><small>총 필요자금</small><strong>{won(assessment.financial.totalFundingNeed)}</strong><span>초기 투자 + {setup.financial.workingCapitalMonths}개월 운전자금</span></div>
              </div>
              <div className={`funding-comparison ${fundingDifference < 0 ? "shortage" : "enough"}`}>
                <div><small>내가 입력한 시작 예산</small><strong>{won(setup.financial.availableCash)}</strong></div>
                <div><small>{fundingDifference < 0 ? "현재 부족한 금액" : "필요자금 제외 후 남는 금액"}</small><strong>{won(Math.abs(fundingDifference))}</strong></div>
                <p>{fundingDifference < 0
                  ? "지금 계획대로 시작하려면 비용을 줄이거나 부족한 자금을 마련해야 합니다."
                  : "입력한 비용 기준으로는 시작 예산 안에서 운영 준비가 가능합니다."}</p>
              </div>
              <div className="financial-result-grid">
                <article><small>건당 공헌이익</small><strong>{won(assessment.financial.contributionPerUnit)}</strong><span>마진율 {assessment.financial.contributionMarginRate}%</span></article>
                <article><small>월 고정비</small><strong>{won(assessment.financial.monthlyFixedCost)}</strong><span>급여 사업주 부담 포함</span></article>
                <article><small>목표 판매 시 월 영업이익</small><strong className={assessment.financial.targetMonthlyOperatingProfit < 0 ? "negative" : ""}>{won(assessment.financial.targetMonthlyOperatingProfit)}</strong><span>소득세·법인세 전</span></article>
                <article><small>무매출 현금 런웨이</small><strong>{assessment.financial.runwayMonths === null ? "제한 없음" : `${assessment.financial.runwayMonths}개월`}</strong><span>현재 가용자금 기준</span></article>
              </div>
              <div className="scenario-table">
                <div><strong>월간 시나리오</strong><span>판매량 변화에 따른 세전 영업손익</span></div>
                {assessment.financial.scenarios.map((scenario) => <article key={scenario.name}><strong>{scenario.name}</strong><span>{scenario.monthlyUnits.toLocaleString("ko-KR")}건</span><em className={scenario.operatingProfitBeforeTax < 0 ? "negative" : ""}>{won(scenario.operatingProfitBeforeTax)}</em></article>)}
              </div>
              {assessment.financial.warnings.length > 0 && <div className="financial-warnings"><strong><AlertTriangle /> 먼저 수정할 재무 위험</strong>{assessment.financial.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>}
              <div className="compliance-summary">
                <div><FileCheck2 /><p><strong>한국 개업 준비 체크</strong><span>필수 {assessment.requiredCount}개 · 진행 차단 {assessment.hardBlockCount}개</span></p></div>
                {assessment.requirements.map((item) => <details key={item.id} className={item.severity}><summary><span>{item.severity === "blocked" ? "진행 전 확인" : item.severity === "required" ? "필수" : "확인"}</span><strong>{item.title}</strong><ChevronRight /></summary><div><p>{item.reason}</p><ol>{item.actions.map((action) => <li key={action}>{action}</li>)}</ol><a href={item.sourceUrl} target="_blank" rel="noreferrer">{item.authority} 공식 안내 확인</a></div></details>)}
              </div>
              <div className="calculation-caveat"><ShieldCheck /><p><strong>자동 계산의 한계</strong>이 결과는 입력값을 기반으로 한 준비용 계산입니다. 세금·보험·인허가의 최종 적용 여부는 공식 기관 확인값으로 갱신해야 하며, 확인되지 않은 항목은 사업계획서에서 가정으로 표시됩니다.</p></div>
            </>
          )}
        </div>
      )}

      {error && <div className="setup-error"><AlertTriangle /> {error}</div>}
      <footer>
        <button onClick={previous} disabled={stepIndex === 0}>이전</button>
        {step === "variable" || step === "result" ? <button className="save-setup" onClick={save} disabled={saving}><Save /> {saving ? "계산·규칙 확인 중..." : assessment ? "변경사항 다시 분석" : "저장하고 사업 조건·손익 계산"}</button> : <button className="next-setup" onClick={next}>다음 단계 <ChevronRight /></button>}
      </footer>
    </section>
  );
}
