"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Check,
  Database,
  Download,
  ExternalLink,
  FileText,
  LoaderCircle,
  MapPin,
  Plus,
  Save,
  Search,
  Trash2,
} from "lucide-react";
import type { BusinessPlanDocument } from "../lib/business-plan/generator";
import { needsPhysicalLocationAnalysis } from "../lib/business/domain";
import { inferBusinessArchetype } from "../lib/business/router";
import {
  emptyMarketWorkspace,
  evidenceSourceTypes,
  type LocationCandidate,
  type MarketEvidence,
  type MarketWorkspace,
} from "../lib/market/domain";
import { analyzeLocations } from "../lib/market/location-engine";
import type { ProjectRecord } from "../lib/service-domain";
import { downloadBusinessDocuments } from "../lib/delivery/client-download";

type Tab = "evidence" | "location" | "plan";

const sourceLabels: Record<(typeof evidenceSourceTypes)[number], string> = {
  official_api: "공식 자료 자동 조회",
  official_report: "정부·공공기관 보고서",
  field_research: "현장 조사",
  customer_interview: "고객 인터뷰",
  competitor_check: "경쟁사 확인",
  supplier_quote: "공급처 견적",
  lease_quote: "임대 조건",
  permit_answer: "관할기관 답변",
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function optionalNumber(value: string) {
  return value.trim() === "" ? null : Math.max(0, Number(value) || 0);
}

function won(value: number) {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function newLocation(): LocationCandidate {
  return {
    id: crypto.randomUUID(),
    name: "",
    address: "",
    latitude: null,
    longitude: null,
    areaSquareMeters: 0,
    deposit: 0,
    monthlyRent: 0,
    monthlyMaintenance: 0,
    keyMoney: 0,
    interiorEstimate: 0,
    expectedMonthlySales: null,
    dailyFootTraffic: null,
    residentPopulation: null,
    workerPopulation: null,
    competitorCount: null,
    parkingScore: null,
    visibilityScore: null,
    targetCustomerFitScore: null,
    buildingUseChecked: false,
    registryChecked: false,
    permitChecked: false,
    fieldVisitCompleted: false,
    sourceUrl: "",
    observedAt: "",
    note: "",
  };
}

export function MarketPlanPanel({
  project,
  onSaved,
}: {
  project: ProjectRecord;
  onSaved: (project: ProjectRecord) => void;
}) {
  const archetype = project.businessSetup?.archetype ?? inferBusinessArchetype(project.opportunity);
  const locationRelevant = needsPhysicalLocationAnalysis(archetype);
  const [tab, setTab] = useState<Tab>(project.businessPlan ? "plan" : "evidence");
  const [workspace, setWorkspace] = useState<MarketWorkspace>(
    project.marketWorkspace ?? emptyMarketWorkspace(),
  );
  const [plan, setPlan] = useState<BusinessPlanDocument | null>(project.businessPlan);
  const [evidenceDraft, setEvidenceDraft] = useState({
    sourceType: "official_report" as MarketEvidence["sourceType"],
    title: "",
    metric: "",
    value: "",
    unit: "",
    region: project.businessSetup?.region ?? "",
    sourceName: "",
    sourceUrl: "",
    observedAt: today(),
    note: "",
    verification: "user_supplied" as MarketEvidence["verification"],
    verificationMethod: "none" as const,
    sourceExcerpt: "",
    retrievedAt: "",
    contentHash: "",
    attestation: "",
    isDemo: false,
  });
  const [locationDraft, setLocationDraft] = useState<LocationCandidate>(newLocation);
  const [busy, setBusy] = useState<"idle" | "saving" | "plan" | "nearby">("idle");
  const [message, setMessage] = useState("");
  const analysis = useMemo(() => analyzeLocations(workspace), [workspace]);

  const addEvidence = () => {
    setMessage("");
    if (!evidenceDraft.title.trim() || !evidenceDraft.metric.trim() || !evidenceDraft.value.trim() || !evidenceDraft.sourceName.trim()) {
      setMessage("근거 제목, 지표, 값, 출처명을 입력해주세요.");
      return;
    }
    setWorkspace((current) => ({
      ...current,
      evidence: [
        ...current.evidence,
        {
          id: crypto.randomUUID(),
          ...evidenceDraft,
          numericValue: optionalNumber(evidenceDraft.value.replaceAll(",", "")),
        },
      ],
    }));
    setEvidenceDraft((current) => ({
      ...current,
      title: "",
      metric: "",
      value: "",
      unit: "",
      sourceName: "",
      sourceUrl: "",
      note: "",
      verification: "user_supplied",
    }));
  };

  const addLocation = () => {
    setMessage("");
    if (!locationDraft.name.trim() || !locationDraft.address.trim()) {
      setMessage("후보 이름과 주소를 입력해주세요.");
      return;
    }
    setWorkspace((current) => ({
      ...current,
      locations: [...current.locations, locationDraft],
    }));
    setLocationDraft(newLocation());
  };

  const lookupNearby = async () => {
    if (locationDraft.latitude === null || locationDraft.longitude === null) {
      setMessage("공식 주변 업소 조회에는 위도와 경도가 필요합니다.");
      return;
    }
    setBusy("nearby");
    setMessage("");
    try {
      const response = await fetch(`/api/projects/${project.id}/market/nearby`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latitude: locationDraft.latitude,
          longitude: locationDraft.longitude,
          radiusMeters: 500,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "주변 업소 조회에 실패했습니다.");
      if (payload.result.status === "missing_key") {
        setMessage("공공데이터포털 연결키가 없어 자동 조회할 수 없습니다. 연결키를 설정하거나 공식 보고서 값을 직접 입력해주세요.");
      } else if (payload.result.status === "error") {
        setMessage(`공식 자료 조회 실패: ${payload.result.error}`);
      } else {
        setLocationDraft((current) => ({
          ...current,
          competitorCount: payload.result.totalCount,
          sourceUrl: payload.result.sourceUrl,
          observedAt: payload.result.observedAt,
        }));
        if (payload.evidence) {
          setWorkspace((current) => ({
            ...current,
            evidence: [...current.evidence, payload.evidence],
          }));
        }
        setMessage(`반경 500m 업소 ${payload.result.totalCount.toLocaleString("ko-KR")}곳을 공식 자료에서 확인했습니다. 같은 업종만 가려내기 전의 전체 업소 수입니다.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "주변 업소 조회 중 오류가 발생했습니다.");
    } finally {
      setBusy("idle");
    }
  };

  const save = async () => {
    setBusy("saving");
    setMessage("");
    try {
      const response = await fetch(`/api/projects/${project.id}/market`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(workspace),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "시장·입지 정보를 저장하지 못했습니다.");
      onSaved(payload.project);
      setPlan(null);
      setMessage("시장 근거와 입지 분석을 저장했습니다. 기존 사업계획서는 최신 자료 반영을 위해 초기화되었습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "저장 중 오류가 발생했습니다.");
    } finally {
      setBusy("idle");
    }
  };

  const generatePlan = async () => {
    setBusy("plan");
    setMessage("");
    try {
      const saveResponse = await fetch(`/api/projects/${project.id}/market`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(workspace),
      });
      const saved = await saveResponse.json();
      if (!saveResponse.ok) throw new Error(saved.error?.message ?? "최신 근거를 저장하지 못했습니다.");
      const response = await fetch(`/api/projects/${project.id}/business-plan`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "사업계획서를 만들지 못했습니다.");
      setPlan(payload.plan);
      onSaved(payload.project);
      setTab("plan");
      setMessage("현재 확인된 자료로 실행용 사업계획서를 만들었습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "사업계획서 생성 중 오류가 발생했습니다.");
    } finally {
      setBusy("idle");
    }
  };

  const downloadPlan = async () => {
    if (!plan) return;
    try {
      await downloadBusinessDocuments({
        format: "docx",
        project: {
          title: project.title,
          sector: String(project.opportunity.sector ?? ""),
          model: String(project.opportunity.model ?? ""),
          customer: String(project.opportunity.customer ?? ""),
          generatedAt: plan.generatedAt,
          sample: false,
        },
        documents: [{ id: "plan", title: plan.title, type: "근거 기반 사업계획서", versionLabel: `${plan.version}판 생성본`, markdown: plan.markdown }],
      });
      setMessage("사업계획서 워드 문서를 만들었습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "사업계획서를 만들지 못했습니다.");
    }
  };

  return (
    <section className="market-plan-panel" id="market-plan-panel">
      <header>
        <div><span><Database /></span><div><small>1단계 · 근거를 확인하는 창업</small><h3>{locationRelevant ? "시장 근거·입지·사업계획서" : "고객·시장 근거와 사업계획서"}</h3><p>{locationRelevant ? "실제 조사값과 공식 자료, 입지 후보를 한곳에 연결합니다." : "온라인 사업에 필요한 고객·경쟁·시장 근거만 정리합니다. 입지 비교는 생략합니다."}</p></div></div>
        <em>{workspace.evidence.length}개 근거{locationRelevant ? ` · ${workspace.locations.length}개 후보` : ""}</em>
      </header>

      <nav className={`market-plan-tabs ${locationRelevant ? "" : "without-location"}`} aria-label="시장 검증 메뉴">
        <button className={tab === "evidence" ? "active" : ""} onClick={() => setTab("evidence")}><Database /> 시장 근거</button>
        {locationRelevant && <button className={tab === "location" ? "active" : ""} onClick={() => setTab("location")}><MapPin /> 입지 비교</button>}
        <button className={tab === "plan" ? "active" : ""} onClick={() => setTab("plan")}><FileText /> 사업계획서</button>
      </nav>

      {message && <div className="market-panel-message" role="status"><AlertTriangle /> {message}</div>}

      {tab === "evidence" && (
        <div className="market-panel-body">
          <div className="official-source-links">
            <strong>공식 원문 바로가기</strong>
            {locationRelevant && <a href="https://golmok.seoul.go.kr/" target="_blank" rel="noreferrer">서울시 상권분석 <ExternalLink /></a>}
            <a href="https://sgis.kostat.go.kr/" target="_blank" rel="noreferrer">통계지리정보서비스 <ExternalLink /></a>
            <a href="https://kosis.kr/" target="_blank" rel="noreferrer">국가통계포털 <ExternalLink /></a>
            {locationRelevant && <a href="https://www.data.go.kr/data/15012005/openapi.do" target="_blank" rel="noreferrer">소상공인시장진흥공단 상가업소 자료 <ExternalLink /></a>}
          </div>
          <div className="market-form-grid">
            <label><span>근거 종류</span><select value={evidenceDraft.sourceType} onChange={(event) => setEvidenceDraft((current) => ({ ...current, sourceType: event.target.value as MarketEvidence["sourceType"] }))}>{evidenceSourceTypes.map((item) => <option key={item} value={item}>{sourceLabels[item]}</option>)}</select></label>
            <label><span>근거 제목</span><input value={evidenceDraft.title} onChange={(event) => setEvidenceDraft((current) => ({ ...current, title: event.target.value }))} placeholder="예: 성수1가 카페업 점포 수" /></label>
            <label><span>확인한 지표</span><input value={evidenceDraft.metric} onChange={(event) => setEvidenceDraft((current) => ({ ...current, metric: event.target.value }))} placeholder="점포 수, 월 매출, 인터뷰 결과" /></label>
            <label><span>값</span><input value={evidenceDraft.value} onChange={(event) => setEvidenceDraft((current) => ({ ...current, value: event.target.value }))} placeholder="예: 128 또는 7명 중 5명" /></label>
            <label><span>단위</span><input value={evidenceDraft.unit} onChange={(event) => setEvidenceDraft((current) => ({ ...current, unit: event.target.value }))} placeholder="개, 원, 명, %" /></label>
            <label><span>지역</span><input value={evidenceDraft.region} onChange={(event) => setEvidenceDraft((current) => ({ ...current, region: event.target.value }))} placeholder="서울 성동구" /></label>
            <label><span>출처명</span><input value={evidenceDraft.sourceName} onChange={(event) => setEvidenceDraft((current) => ({ ...current, sourceName: event.target.value }))} placeholder="서울시 상권분석서비스" /></label>
            <label><span>기준일</span><input type="date" value={evidenceDraft.observedAt} onChange={(event) => setEvidenceDraft((current) => ({ ...current, observedAt: event.target.value }))} /></label>
            <label className="wide"><span>원문 인터넷 주소</span><input type="url" value={evidenceDraft.sourceUrl} onChange={(event) => setEvidenceDraft((current) => ({ ...current, sourceUrl: event.target.value }))} placeholder="자료를 확인한 https:// 주소" /></label>
            <label><span>근거 상태</span><select value={evidenceDraft.verification} onChange={(event) => setEvidenceDraft((current) => ({ ...current, verification: event.target.value as MarketEvidence["verification"] }))}><option value="user_supplied">직접 조사값</option><option value="needs_review">원문 확인 필요</option></select></label>
            <label className="wide"><span>메모</span><textarea value={evidenceDraft.note} onChange={(event) => setEvidenceDraft((current) => ({ ...current, note: event.target.value }))} placeholder="집계 범위와 해석할 때의 주의점" /></label>
          </div>
          <div className="location-warning"><AlertTriangle /><p><strong>직접 입력한 값은 검증 완료가 아닙니다.</strong> 공식 자료 자동 조회로 원문, 수집 시각, 위변조 확인값을 함께 저장한 자료만 “공식 확인”으로 계산합니다.</p></div>
          <button className="add-market-item" onClick={addEvidence}><Plus /> 근거 추가</button>
          <div className="market-item-list">
            {workspace.evidence.map((item) => (
              <article key={item.id}>
                <span className={`verification ${item.verification}`}>{item.verification === "verified" ? "원문 확인" : item.verification === "user_supplied" ? "직접 조사" : "확인 필요"}</span>
                <div><small>{sourceLabels[item.sourceType]} · {item.observedAt}</small><strong>{item.title}</strong><p>{item.metric}: {item.value} {item.unit}</p><em>{item.sourceName} · {item.region || "지역 미지정"}</em></div>
                {item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer" aria-label="원문 열기"><ExternalLink /></a>}
                <button aria-label="근거 삭제" onClick={() => setWorkspace((current) => ({ ...current, evidence: current.evidence.filter((evidence) => evidence.id !== item.id) }))}><Trash2 /></button>
              </article>
            ))}
            {!workspace.evidence.length && <p className="empty-market-list">아직 저장할 시장 근거가 없습니다. 공식 원문이나 실제 조사 결과부터 추가해주세요.</p>}
          </div>
        </div>
      )}

      {tab === "location" && locationRelevant && (
        <div className="market-panel-body">
          <div className="location-warning"><AlertTriangle /><p><strong>점수가 임대 계약을 대신하지 않습니다.</strong> 건축물 용도·등기부·업종 인허가·현장 상태를 확인하지 않으면 추천하지 않습니다.</p></div>
          <div className="market-form-grid location-form">
            <label><span>후보 이름</span><input value={locationDraft.name} onChange={(event) => setLocationDraft((current) => ({ ...current, name: event.target.value }))} placeholder="후보 A · 성수역 2번 출구" /></label>
            <label className="wide"><span>주소</span><input value={locationDraft.address} onChange={(event) => setLocationDraft((current) => ({ ...current, address: event.target.value }))} placeholder="도로명 주소" /></label>
            <NumericInput label="보증금" value={locationDraft.deposit} onChange={(value) => setLocationDraft((current) => ({ ...current, deposit: value }))} />
            <NumericInput label="월세" value={locationDraft.monthlyRent} onChange={(value) => setLocationDraft((current) => ({ ...current, monthlyRent: value }))} />
            <NumericInput label="월 관리비" value={locationDraft.monthlyMaintenance} onChange={(value) => setLocationDraft((current) => ({ ...current, monthlyMaintenance: value }))} />
            <NumericInput label="권리금" value={locationDraft.keyMoney} onChange={(value) => setLocationDraft((current) => ({ ...current, keyMoney: value }))} />
            <NumericInput label="내부 공사 견적" value={locationDraft.interiorEstimate} onChange={(value) => setLocationDraft((current) => ({ ...current, interiorEstimate: value }))} />
            <OptionalNumericInput label="예상 월매출" value={locationDraft.expectedMonthlySales} onChange={(value) => setLocationDraft((current) => ({ ...current, expectedMonthlySales: value }))} />
            <OptionalNumericInput label="일 유동인구" value={locationDraft.dailyFootTraffic} suffix="명" onChange={(value) => setLocationDraft((current) => ({ ...current, dailyFootTraffic: value }))} />
            <OptionalNumericInput label="경쟁점 수" value={locationDraft.competitorCount} suffix="곳" onChange={(value) => setLocationDraft((current) => ({ ...current, competitorCount: value }))} />
            <OptionalNumericInput label="목표고객 적합도" value={locationDraft.targetCustomerFitScore} suffix="점" onChange={(value) => setLocationDraft((current) => ({ ...current, targetCustomerFitScore: value }))} />
            <OptionalNumericInput label="눈에 잘 띄는 정도" value={locationDraft.visibilityScore} suffix="점" onChange={(value) => setLocationDraft((current) => ({ ...current, visibilityScore: value }))} />
            <OptionalNumericInput label="주차 편의" value={locationDraft.parkingScore} suffix="점" onChange={(value) => setLocationDraft((current) => ({ ...current, parkingScore: value }))} />
            <label><span>위도</span><input type="number" step="any" value={locationDraft.latitude ?? ""} onChange={(event) => setLocationDraft((current) => ({ ...current, latitude: event.target.value ? Number(event.target.value) : null }))} placeholder="37.5665" /></label>
            <label><span>경도</span><input type="number" step="any" value={locationDraft.longitude ?? ""} onChange={(event) => setLocationDraft((current) => ({ ...current, longitude: event.target.value ? Number(event.target.value) : null }))} placeholder="126.9780" /></label>
            <label className="wide"><span>자료 원문 인터넷 주소</span><input type="url" value={locationDraft.sourceUrl} onChange={(event) => setLocationDraft((current) => ({ ...current, sourceUrl: event.target.value }))} placeholder="자료를 확인한 https:// 주소" /></label>
            <label><span>조사 기준일</span><input type="date" value={locationDraft.observedAt} onChange={(event) => setLocationDraft((current) => ({ ...current, observedAt: event.target.value }))} /></label>
          </div>
          <div className="location-checks">
            {[
              ["buildingUseChecked", "건축물 용도"],
              ["registryChecked", "등기부 권리"],
              ["permitChecked", "업종 인허가"],
              ["fieldVisitCompleted", "현장 방문"],
            ].map(([key, label]) => <label key={key}><input type="checkbox" checked={Boolean(locationDraft[key as keyof LocationCandidate])} onChange={(event) => setLocationDraft((current) => ({ ...current, [key]: event.target.checked }))} /><span><Check /> {label} 확인</span></label>)}
          </div>
          <div className="location-form-actions">
            <button className="nearby-lookup" disabled={busy !== "idle"} onClick={lookupNearby}>{busy === "nearby" ? <LoaderCircle className="spin" /> : <Search />} 반경 500m 공식 업소 조회</button>
            <button className="add-market-item" onClick={addLocation}><Plus /> 비교 후보 추가</button>
          </div>
          <div className="location-score-grid">
            {workspace.locations.map((candidate) => {
              const score = analysis.locations.find((item) => item.candidateId === candidate.id);
              return (
                <article key={candidate.id} className={workspace.selectedLocationId === candidate.id ? "selected" : ""}>
                  <div className="location-score-head"><span><MapPin /></span><div><small>{candidate.address}</small><strong>{candidate.name}</strong></div><em>{score?.totalScore ?? "—"}<small>/100</small></em></div>
                  <div className="score-bars"><span><small>수요</small><i style={{ width: `${score?.demandScore ?? 0}%` }} /><b>{score?.demandScore ?? "—"}</b></span><span><small>비용</small><i style={{ width: `${score?.costScore ?? 0}%` }} /><b>{score?.costScore ?? "—"}</b></span><span><small>운영</small><i style={{ width: `${score?.operationalScore ?? 0}%` }} /><b>{score?.operationalScore ?? "—"}</b></span></div>
                  <p>월 임차비 {won(score?.monthlyOccupancyCost ?? 0)} · 매출 대비 {score?.occupancyCostRate ?? "—"}%</p>
                  <small>근거 완성도 {score?.evidenceCompleteness ?? 0}%</small>
                  {score?.warnings.slice(0, 2).map((warning) => <p className="score-warning" key={warning}>{warning}</p>)}
                  <div><button onClick={() => setWorkspace((current) => ({ ...current, selectedLocationId: candidate.id }))}>{workspace.selectedLocationId === candidate.id ? <><Check /> 선택됨</> : "이 후보 선택"}</button><button aria-label="후보 삭제" onClick={() => setWorkspace((current) => ({ ...current, locations: current.locations.filter((item) => item.id !== candidate.id), selectedLocationId: current.selectedLocationId === candidate.id ? null : current.selectedLocationId }))}><Trash2 /></button></div>
                </article>
              );
            })}
            {!workspace.locations.length && <p className="empty-market-list">후보를 2곳 이상 입력하면 비용·수요·운영 조건을 상대 비교할 수 있습니다.</p>}
          </div>
        </div>
      )}

      {tab === "plan" && (
        <div className="market-panel-body plan-panel-body">
          {!plan ? (
            <div className="plan-empty"><FileText /><h4>아직 사업계획서를 만들지 않았습니다</h4><p>먼저 저장한 사업 조건과 현재 시장·입지 근거를 합칩니다. 모르는 값은 지어내지 않고 ‘미확인’으로 표시합니다.</p><button disabled={busy !== "idle"} onClick={generatePlan}>{busy === "plan" ? <LoaderCircle className="spin" /> : <BarChart3 />} 실행용 사업계획서 만들기</button></div>
          ) : (
            <>
              <div className="plan-readiness"><div><span>실행 준비도</span><strong>{plan.readinessScore}%</strong><small>확인·계산 {plan.confirmedFactCount}개 · 미확인 {plan.unknownCount}개</small></div><button onClick={() => void downloadPlan()}><Download /> 워드 문서 받기</button></div>
              <div className="plan-section-list">
                {plan.sections.map((section) => <details key={section.id} open={section.id === "summary" || section.status === "unknown"}><summary><span className={section.status}>{section.status === "confirmed" ? "확인" : section.status === "calculated" ? "계산" : section.status === "assumption" ? "가정" : "미확인"}</span><strong>{section.title}</strong><em>{section.content.length}개 항목</em></summary><div>{section.content.map((item) => <p key={item}>{item}</p>)}{section.sources.length > 0 && <div className="plan-sources"><strong>출처</strong>{section.sources.map((source) => <a key={`${source.url}-${source.name}`} href={source.url} target="_blank" rel="noreferrer">{source.name} <ExternalLink /></a>)}</div>}</div></details>)}
              </div>
              <button className="regenerate-plan" disabled={busy !== "idle"} onClick={generatePlan}>최신 근거로 다시 생성</button>
            </>
          )}
        </div>
      )}

      <footer className="market-panel-footer"><div><strong>공식 자료 자동 조회 상태</strong>{locationRelevant && <span>상가업소 자료 {analysis.connectorStatus.sbizStoreApi === "configured" ? "연결됨" : "연결키 필요"}</span>}<span>국가통계포털 {analysis.connectorStatus.kosisApi === "configured" ? "연결됨" : "연결키 필요"}</span>{locationRelevant && <span>서울시 자료 {analysis.connectorStatus.seoulOpenData === "configured" ? "연결됨" : "연결키 필요"}</span>}</div><button disabled={busy !== "idle"} onClick={save}>{busy === "saving" ? <LoaderCircle className="spin" /> : <Save />} {locationRelevant ? "근거·입지 저장" : "시장 근거 저장"}</button></footer>
    </section>
  );
}

function NumericInput({ label, value, onChange, suffix = "원" }: { label: string; value: number; onChange: (value: number) => void; suffix?: string }) {
  return <label><span>{label}</span><div className="market-number-input"><input type="number" min="0" value={value} onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))} /><em>{suffix}</em></div></label>;
}

function OptionalNumericInput({ label, value, onChange, suffix = "원" }: { label: string; value: number | null; onChange: (value: number | null) => void; suffix?: string }) {
  return <label><span>{label}</span><div className="market-number-input"><input type="number" min="0" value={value ?? ""} onChange={(event) => onChange(optionalNumber(event.target.value))} placeholder="미확인" /><em>{suffix}</em></div></label>;
}
