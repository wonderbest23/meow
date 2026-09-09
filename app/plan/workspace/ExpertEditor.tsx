"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { readCoach, type CoachField } from "../../../lib/plan-builder/coach";
import { expertChanges, EXPERT_HISTORY_KEY, type ExpertHistory } from "../../../lib/plan-builder/coach-expert";
import { COACH_FIELD_LABELS } from "../../../lib/plan-builder/coach-presentation";
import { coachAmount } from "../../../lib/plan-builder/coach-feasibility";
import { calculateFinancials } from "../../../lib/plan-builder/financials";
import { businessChatHref } from "../../../lib/plan-builder/business-hub";
import { hydrateFromServer, type Plan } from "../../../lib/plan-builder/plan-store";
import styles from "./LaunchWorkspace.module.css";

const groups: Array<{ title: string; keys: CoachField["key"][] }> = [
  { title: "상품과 고객", keys: ["business", "customer", "offer", "problem", "channel"] },
  { title: "가격과 비용", keys: ["price", "unitCost", "cost", "volume", "budget", "setupCost"] },
  { title: "운영과 목표", keys: ["capacity", "hoursPerWeek", "minutesPerSale", "goal", "sales", "experience"] },
];
function scenario(values: Record<string, string>) {
  const price = coachAmount(values.price), unitCost = coachAmount(values.unitCost), cost = coachAmount(values.cost);
  const volume = /^[\d,]+$/.test(values.volume ?? "") ? Number(values.volume.replaceAll(",", "")) : undefined;
  if (price == null || unitCost == null || cost == null) return null;
  return calculateFinancials({ unitPrice: price, unitVariableCost: unitCost, monthlyFixedCost: cost, startingVolume: volume, monthlyGrowthPct: 0 });
}
export default function ExpertEditor({ plan, onSaved, onDirtyChange }: { plan: Plan; onSaved: (plan: Plan) => void; onDirtyChange: (dirty: boolean) => void }) {
  const coach = readCoach(plan.answers)!;
  const [base, setBase] = useState(coach);
  const [title, setTitle] = useState(coach.business.name);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(coach.fields.map(f => [f.key, f.value])));
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState(false);
  const fields = groups.flatMap(g => g.keys).map(key => ({ key, value: values[key]?.trim() || null }));
  const changes = expertChanges(base, { title: title.trim() || base.business.name, fields });
  useEffect(() => { onDirtyChange(changes.length > 0); return () => onDirtyChange(false); }, [changes.length, onDirtyChange]);
  useEffect(() => {
    if (!changes.length) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changes.length]);
  const after = scenario(values), before = scenario(Object.fromEntries(base.fields.map(f => [f.key, f.value])));
  const history = (plan.answers[EXPERT_HISTORY_KEY]?.entries ?? []) as ExpertHistory[];
  const money = (n: number | undefined) => n === undefined ? "미정" : `${n.toLocaleString("ko-KR")}원`;
  async function save() {
    if (busy || !changes.length) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/plan/expert", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId: plan.id, revision: base.revision, requestId: crypto.randomUUID(), title: title.trim() || base.business.name, fields }) });
      const payload = await response.json();
      if (!response.ok) { setConflict(response.status === 409); throw new Error(payload.message || "저장하지 못했어요."); }
      const next = payload.plan as Plan;
      const updated = readCoach(next.answers)!;
      setBase(updated); setValues(Object.fromEntries(updated.fields.map(f => [f.key, f.value]))); setTitle(updated.business.name);
      onSaved(next); setReview(false); setConflict(false);
      await hydrateFromServer();
      setMessage("사업 정보를 저장했어요. 기존 문서는 보존되며, 문서 반영은 아래 대화에서 요청할 수 있어요.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "저장하지 못했어요."); }
    finally { setBusy(false); }
  }
  async function reload() {
    const state = await hydrateFromServer();
    const next = state.plans.find(p => p.id === plan.id); const latest = next && readCoach(next.answers);
    if (!next || !latest) return;
    onSaved(next); setBase(latest); setValues(Object.fromEntries(latest.fields.map(f => [f.key, f.value]))); setTitle(latest.business.name); setConflict(false); setReview(false); setMessage("최신 정보로 다시 불러왔어요.");
  }
  return <div className={styles.expert}>
    <h2>사업 정보를 정밀하게 다듬어요</h2>
    <p>필요한 항목만 수정하세요. 빈 항목은 미정으로 남고, 문서는 자동으로 덮어쓰지 않아요.</p>
    {!review ? <>
      <label className={styles.field}>사업 이름<input aria-label="사업 이름 수정" value={title} maxLength={100} onChange={e => setTitle(e.target.value)} /></label>
      {groups.map((group, index) => <details key={group.title} open={index === 0 ? true : undefined}><summary>{group.title}</summary><div className={styles.fields}>{group.keys.map(key => <label className={styles.field} key={key}>{COACH_FIELD_LABELS[key]}<small>{base.fields.find(f => f.key === key)?.basis === "proposal" ? "기존 AI 제안" : base.fields.some(f => f.key === key) ? "사용자 제공 정보 · 외부 검증 아님" : "아직 정하지 않음"}</small><textarea aria-label={COACH_FIELD_LABELS[key]} rows={["business", "offer", "problem"].includes(key) ? 3 : 2} maxLength={1200} value={values[key] ?? ""} placeholder={["price", "unitCost", "cost", "budget", "setupCost"].includes(key) ? "예: 99,000원 또는 10만원" : key === "volume" ? "예: 30 (월 판매 목표 건수)" : "모르면 비워두세요"} onChange={e => setValues({ ...values, [key]: e.target.value })} /></label>)}</div></details>)}
    </> : <div className={styles.comparison}><h3>이렇게 바뀌어요</h3>{changes.map(change => <div key={change.key}><strong>{change.label}</strong><p><small>이전</small>{change.before ?? "미정"}</p><p><small>변경</small>{change.after ?? "미정"}</p></div>)}<p>수정한 값은 사용자 제공 정보로 기록해요. 목표나 예상 금액이 실제 실적이 되는 것은 아니에요.</p></div>}
    <details><summary>가격을 바꾸면 얼마나 달라질까요?</summary><p>입력값을 계산한 계획 시나리오예요. 세금·초기 지출·현금 잔액 계산은 포함하지 않아요.</p><div className={styles.tableScroll}><table><thead><tr><th>항목</th><th>저장된 값</th><th>수정안</th></tr></thead><tbody><tr><th>건당 남는 금액</th><td>{money(before?.unit?.contributionMargin)}</td><td>{money(after?.unit?.contributionMargin)}</td></tr><tr><th>월 예상 영업손익</th><td>{money(before?.monthly[0]?.operatingProfit)}</td><td>{money(after?.monthly[0]?.operatingProfit)}</td></tr><tr><th>손익분기 판매량</th><td>{before?.breakEven ? `${before.breakEven.units.toLocaleString("ko-KR")}건` : "계산되지 않음"}</td><td>{after?.breakEven ? `${after.breakEven.units.toLocaleString("ko-KR")}건` : "계산되지 않음"}</td></tr></tbody></table></div><p>판매가·건당 비용·월 고정비가 없으면 계산하지 않아요. 판매량은 목표이며 매달 같다고 가정해요. 건당 남는 금액이 0 이하이면 판매 증가만으로 고정비를 충당할 수 없어요.</p></details>
    <div className={styles.editActions}>{review ? <><button className={styles.secondary} disabled={busy} onClick={() => setReview(false)}>다시 수정</button><button className={styles.primary} disabled={busy || conflict} onClick={() => void save()}>{busy ? "저장 중…" : "변경 내용 저장"}</button></> : <button className={styles.primary} disabled={!changes.length || busy} onClick={() => setReview(true)}>변경 내용 확인</button>}</div>
    {message && <p role="status">{message}</p>}
    {conflict && <button className={styles.secondary} onClick={() => void reload()}>입력 대신 최신 정보 불러오기</button>}
    <Link className={styles.textLink} href={businessChatHref(plan.id, "직접 수정한 최신 사업 정보로 사업안과 문서의 반영이 필요한 부분을 정리해 주세요. 직접 편집한 문서는 보존하고, 변경 내용과 상세 대안을 비교해 주세요.")}>AI와 개선안·문서 반영 검토하기</Link>
    {!!history.length && <details><summary>최근 수정 기록</summary>{[...history].reverse().map(entry => <div className={styles.history} key={entry.id}><strong>{new Date(entry.at).toLocaleString("ko-KR")}</strong><p>{entry.changes.map(c => `${c.label}: ${c.after ?? "미정"}`).join("\n")}</p><button className={styles.secondary} disabled={busy} onClick={() => { const next = { ...values }; for (const change of entry.changes) { if (change.key === "title") setTitle(change.before ?? ""); else next[change.key] = change.before ?? ""; } setValues(next); setReview(true); }}>이 변경을 되돌릴 안 보기</button></div>)}</details>}
  </div>;
}
