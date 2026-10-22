"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { readLaunch, launchSteps, launchStatus, LAUNCH_KEY, quoteAmount, quoteTotals, useOperatingWorkflow, type LaunchState } from "../../../lib/plan-builder/business-launch";
import { readCoach } from "../../../lib/plan-builder/coach";
import { businessChatHref } from "../../../lib/plan-builder/business-hub";
import { homepageHref } from "../../../lib/plan-builder/journey";
import { loadState, pushToServer, saveAnswers, setActivePlan, type Plan } from "../../../lib/plan-builder/plan-store";
import styles from "./LaunchWorkspace.module.css";
import { wonLabel } from "../../../lib/plan-builder/intake-options";
import MarketingKitPanel from "./MarketingKit";

/* 시작 방법 세 가지 — 확인 화면과 바꾸기 화면이 같은 이름을 쓴다 */
const SETUP_CHOICES = {
  purpose: [["ideas", "아이디어만 검토할게요"], ["launch", "새 사업을 시작할게요"], ["improve", "운영 중인 사업을 개선할게요"]],
  workplace: [["remote", "별도 사무실은 필요 없어요"], ["shared", "소호·공유사무실을 알아볼래요"], ["shop", "매장이나 작업장이 필요해요"], ["unknown", "아직 모르겠어요"]],
  registered: [["yes", "이미 등록했어요"], ["no", "아직 등록하지 않았어요"], ["unknown", "나중에 확인할게요"]],
} as const;
const SETUP_KEYS = ["purpose", "workplace", "registered"] as const;
const SETUP_TITLES = ["어디까지 도와드릴까요?", "일할 공간이 필요한가요?", "사업자등록은 하셨나요?"];
const SETUP_SHORT = { purpose: "도움 받을 일", workplace: "일할 곳", registered: "사업자등록" } as const;
function setupLabel(key: typeof SETUP_KEYS[number], value: string) { return (SETUP_CHOICES[key] as ReadonlyArray<readonly [string, string]>).find(([v]) => v === value)?.[1] ?? value; }

export default function LaunchWorkspace({ plan, onSaved }: { plan: Plan; onSaved: (plan: Plan) => void }) {
  const router = useRouter();
  const [state, setState] = useState(() => readLaunch(plan));
  /* 주소의 step(예: 주간 리포트 메일의 '올릴 글 보기' → marketing)이 있으면 그 단계를 바로 연다 */
  const [requestedStep] = useState(() => {
    if (typeof window === "undefined") return null;
    const step = new URLSearchParams(window.location.search).get("step");
    return step && launchSteps(plan, readLaunch(plan)).some(s => s.id === step) ? step : null;
  });
  /*
   * 처음 열면 대화에서 들은 내용으로 채운 값(launchDefaults)을 한 번 확인만 받는다 — 예전엔 세 질문을 처음부터 다시 물었다.
   * 'confirm' 확인 화면 · 0~2 바꾸기 화면 · null 준비 과정
   */
  const [config, setConfig] = useState<number | "confirm" | null>(state.configured || requestedStep ? null : "confirm");
  const [selected, setSelected] = useState<string | null>(() => requestedStep ?? launchSteps(plan, state).find(s => ["pending", "review"].includes(launchStatus(state, s)))?.id ?? null);
  const [note, setNote] = useState<string | null>(null);
  const [material, setMaterial] = useState<string | null>(null);
  /* 업종 준비 체크리스트에서 표시한 항목 — 메모처럼 단계를 저장할 때 함께 저장한다 */
  const [checked, setChecked] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [syncFailed, setSyncFailed] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const steps = launchSteps(plan, state);
  const remaining = steps.find(s => ["pending", "review"].includes(launchStatus(state, s)));
  const current = steps.find(s => s.id === selected) ?? remaining;
  const record = current ? state.records[current.id] : undefined;
  const effectiveMaterial = material ?? record?.material ?? current?.material ?? "";
  const effectiveNote = note ?? record?.note ?? "";
  const effectiveChecked = checked ?? record?.checked ?? [];
  const drafting = note !== null || material !== null || checked !== null;
  const done = steps.filter(s => launchStatus(state, s) === "done").length;
  const skipped = steps.filter(s => launchStatus(state, s) === "skipped").length;
  function top() { window.requestAnimationFrame(() => { heading.current?.scrollIntoView({ block: "start", behavior: "smooth" }); heading.current?.focus({ preventScroll: true }); }); }
  /*
   * 이 기기에 저장되면 true — 서버 저장이 잠깐 막혀도(요청이 많을 때 등) 다음 단계로 넘어간다.
   * 예전엔 서버 저장이 실패하면 기기에는 저장됐는데도 '준비했어요 · 다음'이 제자리였다. 서버 저장은 아래 '다시 시도'로 이어 간다.
   */
  const SYNC_PENDING = "이 기기에 저장했어요. 서버 저장은 연결을 확인한 뒤 아래 '서버 저장 다시 시도'를 눌러 주세요.";
  async function persist(next: LaunchState) {
    setBusy(true); setMessage("");
    const ok = saveAnswers(LAUNCH_KEY, next as unknown as Record<string, unknown>, plan.id);
    if (!ok) { setMessage("기록하지 못했어요. 사업을 다시 열어 주세요."); setBusy(false); return { saved: false, synced: false }; }
    setState(next);
    const saved = loadState().plans.find(p => p.id === plan.id); if (saved) onSaved(saved);
    const synced = await pushToServer();
    setSyncFailed(!synced);
    setMessage(synced ? "저장했어요." : SYNC_PENDING);
    setBusy(false); return { saved: true, synced };
  }
  async function saveStep(status: "pending" | "done" | "skipped", advance: boolean, preserveReview = false) {
    if (!current || busy) return false;
    const next = { ...state, records: { ...state.records, [current.id]: { status, signature: preserveReview && record ? record.signature : current.signature, note: effectiveNote, material: effectiveMaterial, ...(effectiveChecked.length ? { checked: effectiveChecked } : {}), at: new Date().toISOString() } } };
    const result = await persist(next);
    if (result.saved) {
      setNote(null); setMaterial(null); setChecked(null);
      /* 다음 단계로 넘어가면 앞 단계의 '저장했어요.'를 지운다 — 새 단계 화면에 그대로 남아 헷갈렸다. 서버 저장이 남았으면 그 안내는 남긴다 */
      if (advance) { setSelected(launchSteps(plan, next).find(s => ["pending", "review"].includes(launchStatus(next, s)))?.id ?? null); setMessage(result.synced ? "" : SYNC_PENDING); top(); }
      return true;
    }
    return false;
  }
  async function selectStep(id: string) {
    if (drafting && current && !await saveStep("pending", false)) return;
    /* '저장했어요'가 다른 단계로 옮겨도 남아 있었다 */
    setSelected(id); setNote(null); setMaterial(null); setChecked(null); setMessage(""); top();
  }
  async function switchToImprovement() {
    if (busy) return;
    const withDraft = current && drafting
      ? { ...state, records: { ...state.records, [current.id]: { status: record?.status ?? "pending", signature: current.signature, note: effectiveNote, material: effectiveMaterial, ...(effectiveChecked.length ? { checked: effectiveChecked } : {}), at: new Date().toISOString() } } }
      : state;
    if ((await persist(useOperatingWorkflow(withDraft))).saved) {
      setSelected("operations"); setNote(null); setMaterial(null); setChecked(null); top();
    }
  }
  const aiPrompt = current ? `${current.prompt}\n\n현재 단계 메모: ${effectiveNote.slice(0, 600) || "없음"}\n현재 자료: ${effectiveMaterial.slice(0, 600)}\n이전에 기록한 내용(사용자 제공, 외부 검증 아님):\n${steps.filter(s => s.id !== current.id && state.records[s.id]?.note).map(s => `${s.title}: ${state.records[s.id].note.slice(0, 100)}`).join("\n").slice(0, 700)}` : "";

  return <div className={styles.launch}>
    {config === "confirm" ? <div className={styles.setup}>
      <span className={styles.eyebrow}>{readCoach(plan.answers)?.stage === "operating" ? "운영 개선하기" : "사업 시작하기"}</span>
      <h2 ref={heading} tabIndex={-1}>대화에서 들은 내용으로 준비 과정을 맞췄어요</h2>
      <dl className={styles.confirmList}>{SETUP_KEYS.filter(key => key === "purpose" || state.purpose !== "ideas").map(key => <div key={key}><dt>{SETUP_SHORT[key]}</dt><dd>{setupLabel(key, state[key])}</dd></div>)}</dl>
      <p className={styles.confirmNote}>맞으면 바로 시작해요. 다르면 바꿀 수 있고, 나중에 &lsquo;진행 방식 변경&rsquo;에서도 고칠 수 있어요.</p>
      <div className={styles.stepActions}><button className={styles.secondary} disabled={busy} onClick={() => { setConfig(0); top(); }}>바꾸기</button><button className={styles.primary} disabled={busy} onClick={async () => { if ((await persist({ ...state, configured: true })).saved) { setConfig(null); setSelected(null); top(); } }}>{busy ? "저장 중…" : "이대로 시작하기"}</button></div>
    </div> : config !== null ? <div className={styles.setup}>
      <span className={styles.eyebrow}>시작 방법 {config + 1} / 3</span>
      <progress value={config + 1} max={3} aria-label="시작 방법 선택" />
      <h2 ref={heading} tabIndex={-1}>{SETUP_TITLES[config]}</h2>
      <div className={styles.choices}>
        {SETUP_CHOICES[SETUP_KEYS[config]].map(([value, label]) => <button key={value} aria-pressed={value === state[SETUP_KEYS[config]]} onClick={() => setState({ ...state, [SETUP_KEYS[config]]: value })}>{label}</button>)}
      </div>
      <div className={styles.stepActions}>{config > 0 && <button className={styles.secondary} onClick={() => { setConfig(config - 1); top(); }}>이전</button>}<button className={styles.primary} disabled={busy} onClick={async () => { if (config < 2 && state.purpose !== "ideas") { setConfig(config + 1); top(); } else if ((await persist({ ...state, configured: true })).saved) { setConfig(null); setSelected(null); top(); } }}>{config === 2 || state.purpose === "ideas" ? "내 과정 보기" : "다음"}</button></div>
    </div> : <>
      {readCoach(plan.answers)?.stage === "operating" && state.purpose === "launch" && <div className={styles.notice}>
        <p>이제 운영 중인 사업이에요. 시작할 때 남긴 기록을 유지하면서 운영 개선 과정으로 바꿀 수 있어요.</p>
        <button className={styles.secondary} disabled={busy} onClick={() => void switchToImprovement()}>운영 개선으로 전환</button>
      </div>}
      <div className={styles.progressHeading}><span>{done}개 완료 · {skipped}개 나중에</span><button className={styles.textLink} onClick={() => { setConfig(0); top(); }}>진행 방식 변경</button></div>
      <progress value={done} max={steps.length} aria-label="실행 준비 완료" />
      {current ? <>
        <span className={styles.eyebrow}>{steps.findIndex(s => s.id === current.id) + 1} / {steps.length}</span>
        <h2 ref={heading} tabIndex={-1}>{current.title}</h2><p>{current.task}</p>
        {launchStatus(state, current) === "review" && <div className={styles.notice}>사업 정보가 바뀌었어요. 이전 기록은 유지했으니 지금 사업에 맞는지 다시 확인해 주세요.</div>}
        {current.checklist && <div className={styles.checklist} key={`check-${current.id}`}>
          <h3>준비할 것</h3>
          <ul>{current.checklist.needs.map((item, index) => <li key={item}><label><input type="checkbox" checked={effectiveChecked.includes(`need:${index}`)} onChange={e => setChecked(e.target.checked ? [...effectiveChecked, `need:${index}`] : effectiveChecked.filter(id => id !== `need:${index}`))} /><span>{item}</span></label></li>)}</ul>
          <h3>순서</h3>
          <ol>{current.checklist.steps.map((item, index) => <li key={item.title}><label><input type="checkbox" checked={effectiveChecked.includes(`step:${index}`)} onChange={e => setChecked(e.target.checked ? [...effectiveChecked, `step:${index}`] : effectiveChecked.filter(id => id !== `step:${index}`))} /><span><b>{index + 1}. {item.title}</b><small>{item.where}</small>{item.detail}</span></label></li>)}</ol>
          <h3>자주 놓치는 것</h3>
          <ul className={styles.pitfalls}>{current.checklist.pitfalls.map(item => <li key={item}>{item}</li>)}</ul>
          <small>표시한 항목은 &lsquo;준비했어요&rsquo;나 &lsquo;진행 중으로 저장&rsquo;을 누르면 함께 저장돼요.</small>
        </div>}
        {/* 확인 목록은 펼쳐 둔다 — 자료 글 안에 접혀 있으면 단계가 비어 보였다(2026-10-22 결제 단계) */}
        {!current.checklist && current.checks?.length ? <div className={styles.checklist} key={`checks-${current.id}`}>
          <h3>확인할 것</h3>
          <ul>{current.checks.map((item, index) => <li key={item}><label><input type="checkbox" checked={effectiveChecked.includes(`check:${index}`)} onChange={e => setChecked(e.target.checked ? [...effectiveChecked, `check:${index}`] : effectiveChecked.filter(id => id !== `check:${index}`))} /><span>{item}</span></label></li>)}</ul>
          <small>표시한 항목은 &lsquo;준비했어요&rsquo;나 &lsquo;진행 중으로 저장&rsquo;을 누르면 함께 저장돼요.</small>
        </div> : null}
        <details className={styles.material} key={current.id}><summary>{current.checklist ? "글로 복사하거나 고치기" : current.materialTitle}</summary><label className={styles.field}>직접 수정할 수 있어요<textarea aria-label="단계 자료 수정" rows={10} maxLength={20000} value={effectiveMaterial} onChange={e => setMaterial(e.target.value)} /></label><div className={styles.editActions}><button className={styles.secondary} onClick={async () => { try { await navigator.clipboard.writeText(effectiveMaterial); setMessage("내용을 복사했어요."); } catch { setMessage("복사하지 못했어요. 내용을 선택해 복사해 주세요."); } }}>내용 복사</button><button className={styles.secondary} onClick={() => setMaterial(current.material)}>현재 사업 정보로 초안 다시 채우기</button></div><small>저장된 정보로 구성한 초안이며, 미정 항목과 AI 제안은 확인 후 사용하세요.</small></details>
        <label className={styles.field}>메모 <small>선택 사항</small><textarea aria-label="실행 메모" rows={3} maxLength={10000} value={effectiveNote} onChange={e => setNote(e.target.value)} placeholder="정한 내용이나 실제로 확인한 내용을 남겨 주세요." /></label>
        {current.id === "workplace" && <details><summary>받은 견적 비교하기</summary><p>가격은 직접 받은 견적만 입력하세요. 부가세 포함 기준을 맞춰 비교하며, 적정 시세를 판정하지 않아요.</p>{(state.quotes.length ? state.quotes : [{ name: "", monthly: "", deposit: "", initial: "" }, { name: "", monthly: "", deposit: "", initial: "" }]).map((quote, index, quotes) => <div className={styles.quote} key={index}><h3>견적 {index + 1}</h3>{([['name', '업체 이름'], ['monthly', '월 비용 합계'], ['deposit', '보증금'], ['initial', '초기 비용']] as const).map(([key, label]) => <label className={styles.field} key={key}>{label}<input aria-label={`견적 ${index + 1} ${label}`} inputMode={key === "name" ? "text" : "numeric"} value={quote[key]} maxLength={key === "name" ? 100 : 20} placeholder={key === "name" ? "견적을 받은 업체" : "원 · 없으면 0"} onChange={e => { const raw = e.target.value.replace(/[^\d,억만천백원\s]/g, ""); const value = key === "name" ? e.target.value : /^[\d,]+$/.test(raw) ? raw.replace(/,/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",") : raw; setState({ ...state, quotes: quotes.map((q, i) => i === index ? { ...q, [key]: value } : q) }); }} />{key !== "name" && <QuoteAmountNote value={quote[key]} />}</label>)}{quoteTotals(quote) ? <p>12개월 지출: {quoteTotals(quote)!.outflow.toLocaleString("ko-KR")}원<br />보증금 제외 비용: {quoteTotals(quote)!.fees.toLocaleString("ko-KR")}원</p> : <p>비용을 모두 입력하면 계산해요. 모르는 비용은 0원이 아니에요.</p>}</div>)}<small>월 비용이 12개월 동안 같다는 가정이며 보증금 회수 가능성은 별도 확인해야 해요.</small></details>}
        {current.service === "website" && <div className={styles.services}><button className={styles.secondary} onClick={() => { setActivePlan(plan.id); router.push(homepageHref(plan.id)); }}>내 사업 홈페이지 열기</button><Link className={styles.secondary} href="/account/support?category=website" target="_blank" rel="noopener noreferrer" aria-label="디자인·개발 견적 문의 (새 탭)">디자인·개발 견적 문의</Link><small>고객센터에 필요한 내용을 남겨 주세요. 문의만으로 결제되지는 않아요.</small></div>}
        {current.links && <div className={styles.resources}>{current.links.map(link => <a href={link.url} target="_blank" rel="noopener noreferrer" key={link.url}>{link.title}</a>)}<small>공식 안내 확인: 2026. 9. 9. · 기관 화면에서 최신 내용을 확인해 주세요.</small></div>}
        {current.id === "marketing" && <MarketingKitPanel plan={plan} onSaved={onSaved} />}
        {current.id === "tax" && <details><summary>근처 세무사 찾아보기</summary><label className={styles.field}>희망 지역<input aria-label="세무사 희망 지역" maxLength={100} value={state.region} placeholder="예: 서울 마포구" onChange={e => setState({ ...state, region: e.target.value })} /></label>{state.region.trim() && <a className={styles.textLink} target="_blank" rel="noopener noreferrer" href={`https://map.naver.com/p/search/${encodeURIComponent(`${state.region.trim()} 세무사`)}`}>지도에서 직접 찾아보기</a>}<p>외부 검색이며 제휴·추천·예약 서비스가 아니에요.</p></details>}
        {current.caution && <p className={styles.caution}>{current.caution}</p>}
        <Link className={styles.textLink} href={businessChatHref(plan.id, aiPrompt)} onClick={async e => { e.preventDefault(); if (await saveStep(record?.status ?? "pending", false, true)) router.push(businessChatHref(plan.id, aiPrompt)); }}>이 내용으로 AI와 구체화하기</Link>
        <div className={styles.stepActions}><button className={styles.secondary} disabled={busy} onClick={() => void saveStep("skipped", true)}>나중에 할게요</button><button className={styles.primary} disabled={busy} onClick={() => void saveStep("done", true)}>{busy ? "저장 중…" : "준비했어요 · 다음"}</button></div>
        <button className={styles.textLink} disabled={busy} onClick={() => void saveStep("pending", false)}>진행 중으로 저장</button>
      </> : <div className={styles.finish}><h2 ref={heading} tabIndex={-1}>{state.purpose === "ideas" ? "아이디어를 정리했어요" : "선택한 준비 과정을 확인했어요"}</h2><p>{skipped ? `${skipped}개는 나중에 하기로 남겼어요. 아래 과정에서 언제든 이어갈 수 있어요.` : "필요한 단계는 다시 열어 수정할 수 있어요."}</p><p>이 기록은 준비 상태이며, 실제 계약·등록·연결 완료를 대신하지 않아요.</p><Link className={styles.primary} href={businessChatHref(plan.id, "현재 사업의 다음 개선 방향을 함께 정하고 싶어요.")}>대화로 다음 방향 정하기</Link></div>}
      <details><summary>전체 과정과 지난 기록</summary><div className={styles.stepList}>{steps.map(step => <button key={step.id} disabled={busy} onClick={() => void selectStep(step.id)}><span>{step.title}</span><small>{{ done: "준비 완료", skipped: "나중에", pending: "진행 전", review: "다시 확인" }[launchStatus(state, step)]}</small></button>)}</div><p>실행 메모와 자료는 사업계획서와 따로 저장돼요. AI 대화로 구체화한 내용은 확인한 뒤 사업안에 반영할 수 있어요. 준비를 다 하지 않아도 사업계획서는 그대로 쓸 수 있어요.</p></details>
    </>}
    {message && <p role="status">{message}</p>}
    {syncFailed && <button className={styles.secondary} disabled={busy} onClick={() => void persist(state)}>서버 저장 다시 시도</button>}
  </div>;
}

/** '300만'처럼 단위로 적으면 '= 300만원 (3,000,000원)'으로 어떻게 읽었는지 바로 보여 준다. 읽을 수 없으면 예시를 보여 준다 */
function QuoteAmountNote({ value }: { value: string }) {
  if (!value.trim() || /^[\d,]+$/.test(value.trim())) return null;
  const amount = quoteAmount(value);
  return <small aria-live="polite">{amount === null ? "숫자만 적어 주세요 (예: 3000000, 300만)" : `= ${wonLabel(amount)} (${amount.toLocaleString("ko-KR")}원)`}</small>;
}
