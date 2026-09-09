"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { readLaunch, launchSteps, launchStatus, LAUNCH_KEY, quoteTotals, type LaunchState } from "../../../lib/plan-builder/business-launch";
import { businessChatHref } from "../../../lib/plan-builder/business-hub";
import { loadState, pushToServer, saveAnswers, setActivePlan, type Plan } from "../../../lib/plan-builder/plan-store";
import styles from "./LaunchWorkspace.module.css";

export default function LaunchWorkspace({ plan, onSaved }: { plan: Plan; onSaved: (plan: Plan) => void }) {
  const router = useRouter();
  const [state, setState] = useState(() => readLaunch(plan));
  const [config, setConfig] = useState<number | null>(state.configured ? null : 0);
  const [selected, setSelected] = useState<string | null>(() => launchSteps(plan, state).find(s => ["pending", "review"].includes(launchStatus(state, s)))?.id ?? null);
  const [note, setNote] = useState<string | null>(null);
  const [material, setMaterial] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const steps = launchSteps(plan, state);
  const remaining = steps.find(s => ["pending", "review"].includes(launchStatus(state, s)));
  const current = steps.find(s => s.id === selected) ?? remaining;
  const record = current ? state.records[current.id] : undefined;
  const effectiveMaterial = material ?? record?.material ?? current?.material ?? "";
  const effectiveNote = note ?? record?.note ?? "";
  const done = steps.filter(s => launchStatus(state, s) === "done").length;
  const skipped = steps.filter(s => launchStatus(state, s) === "skipped").length;
  function top() { window.requestAnimationFrame(() => { heading.current?.scrollIntoView({ block: "start", behavior: "smooth" }); heading.current?.focus({ preventScroll: true }); }); }
  async function persist(next: LaunchState) {
    setBusy(true); setMessage("");
    const ok = saveAnswers(LAUNCH_KEY, next as unknown as Record<string, unknown>, plan.id);
    if (!ok) { setMessage("기록하지 못했어요. 사업을 다시 열어주세요."); setBusy(false); return false; }
    setState(next);
    const saved = loadState().plans.find(p => p.id === plan.id); if (saved) onSaved(saved);
    const synced = await pushToServer();
    setMessage(synced ? "저장했어요." : "기기에 저장했어요. 서버 저장은 연결을 확인한 뒤 다시 시도해주세요.");
    setBusy(false); return true;
  }
  async function saveStep(status: "pending" | "done" | "skipped", advance: boolean) {
    if (!current || busy) return false;
    const next = { ...state, records: { ...state.records, [current.id]: { status, signature: current.signature, note: effectiveNote, material: effectiveMaterial, at: new Date().toISOString() } } };
    if (await persist(next)) {
      setNote(null); setMaterial(null);
      if (advance) { setSelected(launchSteps(plan, next).find(s => ["pending", "review"].includes(launchStatus(next, s)))?.id ?? null); top(); }
      return true;
    }
    return false;
  }
  async function selectStep(id: string) {
    if ((note !== null || material !== null) && current && !await saveStep("pending", false)) return;
    setSelected(id); setNote(null); setMaterial(null); top();
  }
  const aiPrompt = current ? `${current.prompt}\n\n현재 단계 메모: ${effectiveNote.slice(0, 600) || "없음"}\n현재 자료: ${effectiveMaterial.slice(0, 600)}\n이전에 기록한 내용(사용자 제공, 외부 검증 아님):\n${steps.filter(s => s.id !== current.id && state.records[s.id]?.note).map(s => `${s.title}: ${state.records[s.id].note.slice(0, 100)}`).join("\n").slice(0, 700)}` : "";

  return <div className={styles.launch}>
    {config !== null ? <div className={styles.setup}>
      <span className={styles.eyebrow}>시작 방법 {config + 1} / 3</span>
      <progress value={config + 1} max={3} aria-label="시작 방법 선택" />
      <h2 ref={heading} tabIndex={-1}>{["어디까지 도와드릴까요?", "일할 공간이 필요한가요?", "사업자등록은 하셨나요?"][config]}</h2>
      <div className={styles.choices}>
        {(config === 0 ? [["ideas", "아이디어만 검토할게요"], ["launch", "새 사업을 시작할게요"], ["improve", "운영 중인 사업을 개선할게요"]] : config === 1 ? [["remote", "별도 사무실은 필요 없어요"], ["shared", "소호·공유사무실을 알아볼래요"], ["shop", "매장이나 작업장이 필요해요"], ["unknown", "아직 모르겠어요"]] : [["yes", "이미 등록했어요"], ["no", "아직 등록하지 않았어요"], ["unknown", "나중에 확인할게요"]]).map(([value, label]) => <button key={value} aria-pressed={value === (config === 0 ? state.purpose : config === 1 ? state.workplace : state.registered)} onClick={() => setState({ ...state, [config === 0 ? "purpose" : config === 1 ? "workplace" : "registered"]: value })}>{label}</button>)}
      </div>
      <div className={styles.stepActions}>{config > 0 && <button className={styles.secondary} onClick={() => { setConfig(config - 1); top(); }}>이전</button>}<button className={styles.primary} disabled={busy} onClick={async () => { if (config < 2 && state.purpose !== "ideas") { setConfig(config + 1); top(); } else if (await persist({ ...state, configured: true })) { setConfig(null); setSelected(null); top(); } }}>{config === 2 || state.purpose === "ideas" ? "내 과정 보기" : "다음"}</button></div>
    </div> : <>
      <div className={styles.progressHeading}><span>{done}개 완료 · {skipped}개 나중에</span><button className={styles.textLink} onClick={() => { setConfig(0); top(); }}>진행 방식 변경</button></div>
      <progress value={done} max={steps.length} aria-label="실행 준비 완료" />
      {current ? <>
        <span className={styles.eyebrow}>{steps.findIndex(s => s.id === current.id) + 1} / {steps.length}</span>
        <h2 ref={heading} tabIndex={-1}>{current.title}</h2><p>{current.task}</p>
        {launchStatus(state, current) === "review" && <div className={styles.notice}>사업 정보가 바뀌었어요. 이전 기록은 유지했으니 지금 사업에 맞는지 다시 확인해주세요.</div>}
        <details className={styles.material} key={current.id}><summary>{current.materialTitle}</summary><label className={styles.field}>직접 수정할 수 있어요<textarea aria-label="단계 자료 수정" rows={10} maxLength={20000} value={effectiveMaterial} onChange={e => setMaterial(e.target.value)} /></label><div className={styles.editActions}><button className={styles.secondary} onClick={async () => { try { await navigator.clipboard.writeText(effectiveMaterial); setMessage("내용을 복사했어요."); } catch { setMessage("복사하지 못했어요. 내용을 선택해 복사해주세요."); } }}>내용 복사</button><button className={styles.secondary} onClick={() => setMaterial(current.material)}>현재 사업 정보로 초안 다시 채우기</button></div><small>저장된 정보로 구성한 초안이며, 미정 항목과 AI 제안은 확인 후 사용하세요.</small></details>
        <label className={styles.field}>메모 <small>선택 사항</small><textarea aria-label="실행 메모" rows={3} maxLength={10000} value={effectiveNote} onChange={e => setNote(e.target.value)} placeholder="정한 내용이나 실제로 확인한 내용을 남겨주세요." /></label>
        {current.id === "workplace" && <details><summary>받은 견적 비교하기</summary><p>가격은 직접 받은 견적만 입력하세요. 부가세 포함 기준을 맞춰 비교하며, 적정 시세를 판정하지 않아요.</p>{(state.quotes.length ? state.quotes : [{ name: "", monthly: "", deposit: "", initial: "" }, { name: "", monthly: "", deposit: "", initial: "" }]).map((quote, index, quotes) => <div className={styles.quote} key={index}><h3>견적 {index + 1}</h3>{([['name', '업체 이름'], ['monthly', '월 비용 합계'], ['deposit', '보증금'], ['initial', '초기 비용']] as const).map(([key, label]) => <label className={styles.field} key={key}>{label}<input aria-label={`견적 ${index + 1} ${label}`} inputMode={key === "name" ? "text" : "numeric"} value={quote[key]} maxLength={key === "name" ? 100 : 20} placeholder={key === "name" ? "견적을 받은 업체" : "원 · 없으면 0"} onChange={e => { const value = key === "name" ? e.target.value : e.target.value.replace(/[^\d]/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ","); setState({ ...state, quotes: quotes.map((q, i) => i === index ? { ...q, [key]: value } : q) }); }} /></label>)}{quoteTotals(quote) ? <p>12개월 지출: {quoteTotals(quote)!.outflow.toLocaleString("ko-KR")}원<br />보증금 제외 비용: {quoteTotals(quote)!.fees.toLocaleString("ko-KR")}원</p> : <p>비용을 모두 입력하면 계산해요. 모르는 비용은 0원이 아니에요.</p>}</div>)}<small>월 비용이 12개월 동안 같다는 가정이며 보증금 회수 가능성은 별도 확인해야 해요.</small></details>}
        {current.service === "website" && <div className={styles.services}><button className={styles.secondary} onClick={() => { setActivePlan(plan.id); router.push("/plan/homepage"); }}>내 사업으로 홈페이지 만들기</button><button className={styles.secondary} onClick={() => window.dispatchEvent(new CustomEvent("venture:open-support-chat", { detail: { mode: "support", message: `홈페이지 디자인·개발 유료 상담을 요청합니다.\n사업: ${plan.title}\n사업 ID: ${plan.id}\n요청 내용: ${effectiveMaterial.slice(0, 1100)}\n예산과 일정, 작업 범위를 상담 후 확정하고 싶습니다.` } }))}>디자인·개발 견적 문의</button><small>상담창에서 내용을 확인하고 전송해주세요. 버튼을 누르는 것만으로 신청되거나 결제되지 않아요.</small></div>}
        {current.links && <div className={styles.resources}>{current.links.map(link => <a href={link.url} target="_blank" rel="noopener noreferrer" key={link.url}>{link.title}</a>)}<small>공식 안내 확인: 2026. 9. 9. · 기관 화면에서 최신 내용을 확인해주세요.</small></div>}
        {current.id === "tax" && <details><summary>근처 세무사 찾아보기</summary><label className={styles.field}>희망 지역<input aria-label="세무사 희망 지역" maxLength={100} value={state.region} placeholder="예: 서울 마포구" onChange={e => setState({ ...state, region: e.target.value })} /></label>{state.region.trim() && <a className={styles.textLink} target="_blank" rel="noopener noreferrer" href={`https://map.naver.com/p/search/${encodeURIComponent(`${state.region.trim()} 세무사`)}`}>지도에서 직접 찾아보기</a>}<p>외부 검색이며 제휴·추천·예약 서비스가 아니에요.</p></details>}
        {current.caution && <p className={styles.caution}>{current.caution}</p>}
        <Link className={styles.textLink} href={businessChatHref(plan.id, aiPrompt)} onClick={async e => { e.preventDefault(); if (await saveStep(record?.status ?? "pending", false)) router.push(businessChatHref(plan.id, aiPrompt)); }}>이 내용으로 AI와 구체화하기</Link>
        <div className={styles.stepActions}><button className={styles.secondary} disabled={busy} onClick={() => void saveStep("skipped", true)}>나중에 할게요</button><button className={styles.primary} disabled={busy} onClick={() => void saveStep("done", true)}>{busy ? "저장 중…" : "준비했어요 · 다음"}</button></div>
        <button className={styles.textLink} disabled={busy} onClick={() => void saveStep("pending", false)}>진행 중으로 저장</button>
      </> : <div className={styles.finish}><h2 ref={heading} tabIndex={-1}>{state.purpose === "ideas" ? "아이디어를 정리했어요" : "선택한 준비 과정을 확인했어요"}</h2><p>{skipped ? `${skipped}개는 나중에 하기로 남겼어요. 아래 과정에서 언제든 이어갈 수 있어요.` : "필요한 단계는 다시 열어 수정할 수 있어요."}</p><p>이 기록은 준비 상태이며, 실제 계약·등록·연결 완료를 대신하지 않아요.</p><Link className={styles.primary} href={businessChatHref(plan.id, "현재 사업의 다음 개선 방향을 함께 정하고 싶어요.")}>대화로 다음 방향 정하기</Link></div>}
      <details><summary>전체 과정과 지난 기록</summary><div className={styles.stepList}>{steps.map(step => <button key={step.id} disabled={busy} onClick={() => void selectStep(step.id)}><span>{step.title}</span><small>{{ done: "준비 완료", skipped: "나중에", pending: "진행 전", review: "다시 확인" }[launchStatus(state, step)]}</small></button>)}</div><p>실행 메모와 자료는 사업계획서와 별도로 저장돼요. AI 대화로 구체화한 내용은 검토 후 사업안에 반영할 수 있어요. 실행 여부는 문서 이용 조건이 아니에요.</p></details>
    </>}
    {message && <p role="status">{message}</p>}
  </div>;
}
