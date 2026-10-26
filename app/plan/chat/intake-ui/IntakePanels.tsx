"use client";
import { ResourceFitDetails, resourceFitLine } from "./ResourcePanel";
import { INTAKE_JOB_TIMING } from "../../../../lib/plan-builder/intake-timing";
import { chaptersForType } from "../../../../lib/plan-builder/blueprint";
import { businessDisplayName } from "../../../../lib/plan-builder/business-name";

import { Fragment, useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { LoadingStatus, Spinner } from "../../PlanLoading";
import { ArrowRight, Check, CheckCircle2, ChevronRight, FileText, Lightbulb, ListFilter, LoaderCircle, PencilLine, Plus, Sparkles, Store, X } from "lucide-react";
import type { IntakeCommand, IntakeSnapshot, IntakeValue } from "../../../../lib/plan-builder/intake-types";
import { getIntakeQuestion, type IntakeMode, type IntakeQuestion } from "../../../../lib/plan-builder/intake-questions";
import { COACH_FIELD_LABELS, coachFieldDisplay } from "../../../../lib/plan-builder/coach-presentation";
import { amountRanges, rangeMidpoint, CHIP_GROUPS, COST_RATIO_PRESETS, suggestPriceFromCost, formatWon, numberAnswer, numberPresetLabel, numberPresets, openEndPresets, periodMonths, scaledAmountRanges, stepFor, wonAnswer, wonLabel, type AmountRange } from "../../../../lib/plan-builder/intake-options";
import { answerText, assembleHybridText, hybridComplete, incompleteChoiceText, COUNT_PREFIX, candidateConflict, chipLimit, groupTitle, intakeChipSector, isFilterGroup, isHybridQuestion, isPrefillQuestion, metricNeedsCount, optionGroups, PERIOD_PRESETS, periodDates, periodDisplay, periodPresetRange, plainText, readableFinancialSummary, selectedCount, stepVisible, suggestedIntakeIndustry, summaryAnswerText, toggleChip, unmatchedPieces, withCount, type AnswerDraft, jobProgress, intakeNextStep } from "./model";
import { mentionedAnswer, mentionsSolo, undecidedHelp } from "./guidance";
import { CoachWelcome } from "../../../../components/coach-chat-ui";
import { STRUCTURE_AXES, STRUCTURE_LABELS, type BusinessStructure, type StructureAxis } from "../../../../lib/plan-builder/business-structure";
import { ksicNameHint, ksicSectorLabel } from "../../../../lib/plan-builder/ksic-hints";
import { parseWonAmount } from "../../../../lib/plan-builder/answer-number";
import styles from "../intake.module.css";
import { chatTextPreview, questionPromptText, unitCostRanges } from "./model";
import type { QuestionSuggestions } from "./AnswerSuggestions";
import { editExamples } from "../../../../lib/plan-builder/edit-examples";
import { MessageMeta, WorkLog } from "./WorkLog";
import { editFoundItem, marginLogItem } from "./work-log";
import { splitSectionEditMessage } from "../../../../lib/plan-builder/studio-plan-edit";

export function EntryChoices({ disabled, onStart, initialMessage, coach = false }: { disabled: boolean; onStart: (mode: IntakeMode) => void; initialMessage?: string | null; coach?: boolean }) {
  const choices = [
    { mode: "exploring" as const, label: "아이디어를 찾고 있어요", Icon: Lightbulb },
    { mode: "startup" as const, label: "생각한 사업이 있어요", Icon: FileText },
    { mode: "operating" as const, label: "사업을 운영 중이에요", Icon: Store },
  ];
  // Coach chat opens like a messenger: a short greeting, the first question as a bubble, three pills to tap.
  if (coach) return <section className={styles.chatHistory} aria-labelledby="intake-entry-heading" data-coach-entry>
    {/* 첫 인사 말풍선은 두지 않는다 — 바로 첫 질문(r37 글 점검). 고르는 것이 단계라 질문도 단계를 묻는다(대화 기록 첫 줄과 같은 말) */}
    {initialMessage && <><article className={styles.userMessage} data-coach-message="user"><p>{initialMessage}</p></article><p className={styles.messageStatus}>이 기기에 보관 중</p></>}
    <div className={`${styles.question} ${styles.chatQuestion}`}>
      <h2 id="intake-entry-heading">지금 어느 단계세요?</h2>
      <div className={styles.chipRow} role="group" aria-label="대화 시작 선택지">{choices.map(({ mode, label }) => <button type="button" key={mode} className={styles.chip} disabled={disabled} onClick={() => onStart(mode)}>{label}</button>)}</div>
    </div>
  </section>;
  return <section className={styles.entry} aria-labelledby="intake-entry-heading">
    <div id="intake-entry-heading"><CoachWelcome tagline={false} /></div>
    {initialMessage && <div className={styles.introMessage}><article className={styles.userMessage} data-coach-message="user"><p>{initialMessage}</p></article><p className={styles.messageStatus}>이 기기에 보관 중</p><div className={styles.assistantMessage}><ChatSpeaker /><p>지금 어느 단계에 계신가요?<br />이 이야기부터 이어갈게요</p></div></div>}
    <div className={styles.entryChoices} aria-label="대화 시작 선택지">{choices.map(({ mode, label, Icon }) => <button type="button" key={mode} disabled={disabled} onClick={() => onStart(mode)}><Icon size={23} aria-hidden="true" /><span>{label}</span><ChevronRight size={20} aria-hidden="true" /></button>)}</div>
  </section>;
}

/** 업종 검색은 두 글자부터, 한 글자는 완성된 한글('빵'·'꽃'·'떡')일 때만 — 조합 중인 자모('ㅂ')로는 찾지 않는다 */
const ksicSearchable = (query: string) => query.length >= 2 || /^[가-힣]$/.test(query);

export function QuestionForm({ question, snapshot, draft, editing, disabled, onChange: change, onAnswer, onCancel, inChat = false, refining = false, suggestions, coach = false, ksicQuery: composerQuery, onCarry, onComposer, cardLabel, cardFoot }: {
  question: IntakeQuestion; snapshot: IntakeSnapshot; draft: AnswerDraft; editing: boolean; disabled: boolean;
  /** `submit`: in coach chat a finished pick is sent right away, as if the send button were pressed. */
  onChange: (value: AnswerDraft, submit?: boolean) => void; onAnswer: (value: IntakeValue, unknown?: boolean, questionId?: string, extra?: { ksic?: string }) => void;
  onCancel: () => void; inChat?: boolean; refining?: boolean;
  /** 첫 사업 설명에 맞춘 AI 추천(시험 기능). 누르면 입력칸에 들어가고, 보내기 전까지는 답변이 아니다. */
  suggestions?: QuestionSuggestions;
  /** Coach chat: chips send on their own, and the composer doubles as the industry search box. */
  coach?: boolean; ksicQuery?: string;
  /** 원가 계산기에서 넣은 1개당 원가를 다음 변동비 질문의 입력칸에 미리 채워 둔다(보내기 전까지는 답변이 아니다). */
  onCarry?: (questionId: string, text: string) => void;
  /** 코치 채팅: 입력창으로 손이 가야 할 때(문장 칩의 ○○ 채우기, '직접 적을래요') 입력창에 커서를 옮긴다. */
  onComposer?: (select?: string) => void;
  /** 작업실 PC: 지금 질문을 흰 카드로 — 맨 위 작은 줄('질문 10 / 14')과 맨 아래 줄(직접 적기 안내 · 앞 질문 고치기). 없으면 예전 모양 */
  cardLabel?: string; cardFoot?: ReactNode;
}) {
  const onChange = (value: AnswerDraft) => change(value);
  const send = (value: AnswerDraft) => change(value, coach);
  const [manualIndustry, setManualIndustry] = useState(editing || draft.selected.length > 0);
  const seededPeriod = question.id === "period" ? periodDates(draft.text) : null;
  const [customPeriod, setCustomPeriod] = useState(!!seededPeriod);
  const [periodStart, setPeriodStart] = useState(seededPeriod?.[0] ?? "");
  const [periodEnd, setPeriodEnd] = useState(seededPeriod?.[1] ?? "");
  const suggested = inChat && question.id === "industry" && !editing ? suggestedIntakeIndustry(snapshot) : null;
  const showSuggested = !!suggested && !manualIndustry;
  const mention = inChat && !editing ? mentionedAnswer(snapshot, question) : null;
  const showMention = !!mention && draft.dismissedMention !== mention.key && !draft.text && !draft.selected.length && !draft.unknown;
  const undecided = undecidedHelp(question);
  const ksicCandidates = inChat && question.id === "industry" && !manualIndustry ? snapshot.ksicCandidates : [];
  /*
   * 업종 추천은 한 목록으로 — 예전엔 세부 업종 후보(펫시터·돌봄)와 큰 분류 카드('기업 서비스 · 이 업종 선택')가 함께 나와
   * 둘이 다른 답을 권했다(여정 점검 2026-10-23). 후보가 있으면 큰 카드는 숨기고 첫 후보를 추천으로 표시한다.
   */
  const suggestionCard = showSuggested && ksicCandidates.length === 0;
  const recommendFirst = showSuggested && ksicCandidates.length > 0;
  /*
   * 운영 범위: 첫 설명에 '1인 ○○ 가게'처럼 혼자 한다고 했으면 '대표자 혼자'를 미리 골라 둔다(보내지는 않는다).
   * 예전엔 이미 말한 내용을 처음부터 다시 물었다(여정 점검 2026-10-23).
   */
  const soloOption = inChat && coach && !editing && question.id === "capacity" ? (question.options ?? []).find(option => option.group === CHIP_GROUPS.people && option.label === "대표자 혼자") : undefined;
  const [soloSeeded, setSoloSeeded] = useState(false);
  useEffect(() => {
    if (soloSeeded || !soloOption || draft.selected.length || draft.text.trim() || draft.unknown || !mentionsSolo(snapshot)) return;
    setSoloSeeded(true);
    onChange({ ...draft, custom: false, unknown: false, selected: [soloOption.value], text: assembleHybridText(question, [soloOption.value]) });
    // 질문이 처음 보일 때 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soloOption?.value]);
  const [ownKsicQuery, setKsicQuery] = useState("");
  const ksicQuery = coach ? composerQuery ?? "" : ownKsicQuery;
  /*
   * 어떤 검색어의 결과인지, 검색이 실패했는지 같이 둔다 — 예전엔 연결이 끊겨도 '맞는 업종을 못 찾았어요'라고 했고,
   * 검색이 끝나기 전에도 같은 말이 잠깐 보였다.
   */
  const [ksicSearch, setKsicSearch] = useState<{ query: string; items: IntakeSnapshot["ksicCandidates"]; failed: boolean }>({ query: "", items: [], failed: false });
  /* 연결이 끊겨 검색이 실패했으면 다시 연결되는 순간 같은 검색어로 한 번 더 찾는다 — 예전엔 연결된 뒤에도 실패 안내가 남았다(점검 2026-10-23) */
  const [ksicRetry, setKsicRetry] = useState(0);
  useEffect(() => {
    if (!ksicSearch.failed) return;
    const retry = () => setKsicRetry(count => count + 1);
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [ksicSearch.failed]);
  useEffect(() => {
    const query = ksicQuery.trim();
    if (!inChat || question.id !== "industry" || !ksicSearchable(query)) { setKsicSearch({ query: "", items: [], failed: false }); return; }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/plan/chat?ksic=${encodeURIComponent(query)}`, { headers: { "x-business-intake": "2" }, cache: "no-store", signal: controller.signal })
        .then(response => { if (!response.ok) throw new Error("KSIC_SEARCH_FAILED"); return response.json(); })
        .then(data => { if (!controller.signal.aborted) setKsicSearch({ query, items: Array.isArray(data?.ksicCandidates) ? data.ksicCandidates : [], failed: false }); })
        .catch(() => { if (!controller.signal.aborted) setKsicSearch({ query, items: [], failed: true }); });
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [ksicQuery, inChat, question.id, ksicRetry]);
  const ksicSearched = ksicSearch.query !== "" && ksicSearch.query === ksicQuery.trim();
  /* 찾은 업종이 없으면(업종이 아닌 말을 적었을 때 등) 추천 후보를 그대로 둔다 — 예전엔 추천 칩이 사라져 고를 것이 없었다(r37 휴대폰 점검) */
  const ksicShown = ksicSearchable(ksicQuery.trim()) && ksicSearch.items.length ? ksicSearch.items : ksicCandidates;
  const candidate = question.id === "candidate";
  const options = candidate ? snapshot.candidateIdeas.map(idea => ({ value: idea.id, label: idea.title })) : question.options ?? [];
  const stage = (value: IntakeValue) => send({ ...draft, text: String(value ?? ""), unknown: false });
  const commit = (value: IntakeValue) => { if (!disabled) { if (inChat) stage(value); else onAnswer(value, false, question.id); } };
  /*
   * 하나만 고르는 질문에서 화살표로 옮긴 선택은 고르기만 하고 보내지 않는다 — 보내기는 누르기·Enter·Space로.
   * 예전엔 화살표 한 번에 바로 보내져 다른 답을 살펴볼 수 없었다(접근성 점검 2026-10-22).
   */
  const arrowPick = useRef(false);
  const choose = (value: string) => {
    const selected = question.kind === "multi" ? toggleChip(question, draft.selected, value) : [value];
    const keyed = arrowPick.current;
    arrowPick.current = false;
    (question.kind === "multi" || keyed ? onChange : send)({ ...draft, custom: false, selected, unknown: false, ksic: undefined });
  };
  const sendPicked = (value: string) => send({ ...draft, custom: false, selected: [value], unknown: false, ksic: undefined });
  const radioKey = (event: ReactKeyboardEvent<HTMLInputElement>, value: string) => {
    if (event.key.startsWith("Arrow")) { arrowPick.current = true; return; }
    // 이미 고른 보기에서 Space 는 브라우저가 click 을 내지 않는다 — Enter 처럼 직접 보낸다
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); sendPicked(value); }
  };
  const choice = !draft.custom && ["single", "multi"].includes(question.kind);
  const hybrid = isHybridQuestion(question);
  const prefill = isPrefillQuestion(question);
  const numeric = question.kind === "number";
  const value = choice ? question.kind === "multi" ? draft.selected : draft.selected[0] ?? "" : draft.text.trim();
  const valid = Array.isArray(value) ? value.length > 0 : String(value).length > 0;
  const submit = (event: FormEvent) => { event.preventDefault(); if (!inChat && !disabled && valid) onAnswer(value, false, candidate && draft.custom ? "business" : question.id); };
  const hintId = `intake-hint-${question.id}`;
  const period = question.id === "period" && !choice;
  const isoDate = /^\d{4}-\d{2}-\d{2}$/;
  const customPeriodValid = isoDate.test(periodStart) && isoDate.test(periodEnd) && periodStart <= periodEnd;
  const groups = optionGroups(options);
  // 예산·시간 안내는 카드마다 같은 말을 되풀이하지 않고 목록 위에 한 번만. 카드에는 판단이 있을 때(넉넉함·넘침 등)만 붙인다.
  const unknownFit = candidate ? snapshot.candidateIdeas.find(idea => idea.resourceFit && idea.resourceFit.status === "unknown")?.resourceFit : undefined;
  const revealed = (index: number) => stepVisible(question, groups, index, draft.selected);
  // A text amount question (food_beverage.averageTicket) keeps kind text but offers the ladder; picks land in draft.text with an (예상)/(실제 기록) tag.
  const sector = intakeChipSector(snapshot);
  const ticketRanges = question.kind === "text" && question.unit === "원" && !question.options?.length ? amountRanges(sector, question.id, snapshot.intake.mode) : [];
  const ticket = ticketRanges.length > 0;
  // Space price picks a basis (시간당 · 1박 · 월 멤버십) before its ladder; sales scales the monthly ladder by the reporting period.
  const basisOptions = numeric && question.options?.length ? options : [];
  const basis = basisOptions.find(option => draft.selected.includes(option.value))?.label;
  const months = question.id === "sales" ? periodMonths(answerText(snapshot.intake.answers.period?.value ?? null)) : null;
  const fullLadder = numeric && question.unit === "원" && (!basisOptions.length || basis) ? amountRanges(sector, question.id, snapshot.intake.mode, basis) : [];
  // 건당 비용 칩은 판매 가격보다 큰 범위를 뺀다(9,500원 메뉴에 '300,000원 이상'이 나왔다)
  const ladder = question.id === "structure.unitCost" ? unitCostRanges(fullLadder, snapshot) : fullLadder;
  const ranges = months && months > 1 ? scaledAmountRanges(ladder, months) : ladder;
  return <section className={`${styles.question} ${inChat ? styles.chatQuestion : ""}`} aria-labelledby="intake-question-heading" data-chat-question={inChat || undefined} data-question-card={cardLabel || cardFoot ? true : undefined}>
    {inChat && <ChatSpeaker />}
    {cardLabel && <p className={styles.questionCardLabel}>{cardLabel}</p>}
    {(!inChat || editing) && <div className={styles.questionMeta}>
      <span>{refining ? "선택 보완" : editing ? "답변 수정" : inChat ? "" : snapshot.coreComplete ? "선택 보완" : "기본 질문"}</span>
      {editing && <button type="button" className={styles.textButton} onClick={onCancel}>{snapshot.coreComplete ? "마무리로 돌아가기" : "현재 질문으로"}</button>}
    </div>}
    <h2 id="intake-question-heading" tabIndex={-1}>{showMention ? `${question.label}, 앞서 말한 내용으로 이어갈까요?` : showSuggested ? "이 업종으로 정리할까요?" : questionPromptText(question.prompt)}</h2>
    {question.hint && !showSuggested && !showMention && <p className={styles.questionHint}>{coach && numeric && question.unit === "원" && ladder.length > 0 ? "대략 고르면 가운데 값으로 계산해요. 정확히 알면 입력창에 적어 주세요." : question.hint}</p>}
    {draft.hint && <p className={styles.draftHint}>이전 답변: {draft.hint}</p>}
    {soloSeeded && soloOption && draft.selected.includes(soloOption.value) && <p className={styles.draftHint}>앞서 혼자 한다고 하셔서 &apos;{soloOption.label}&apos;를 골라 뒀어요. 다르면 바꿔 주세요.</p>}
    <form onSubmit={submit}>
      {showMention && <div className={styles.mention} aria-label="이전 대화에서 찾은 답변">
        <blockquote>{mention.quote}</blockquote>
        <p>답변으로 쓸 내용: <strong>{mention.value}</strong></p>
        <div className={styles.suggestionActions}>
          <button type="button" className={styles.primaryButton} disabled={disabled} onClick={() => send({ ...draft, text: mention.value, selected: [], unknown: false, dismissedMention: mention.key })}>이 내용 선택<Check size={17} aria-hidden="true" /></button>
          <button type="button" className={styles.textButton} disabled={disabled} onClick={() => onChange({ ...draft, dismissedMention: mention.key })}>다르게 답하기</button>
        </div>
      </div>}
      <div hidden={showMention}>
      {inChat && question.id === "industry" && !manualIndustry && <div className={styles.ksicCandidates} role="group" aria-label="표준산업분류 후보">
        {!coach && <label className={styles.ksicSearch}><span className={styles.srOnly}>업종 이름으로 찾기</span><input type="search" value={ksicQuery} placeholder="업종 이름으로 찾기 (예: 네일, 반찬, 학원)" maxLength={80} disabled={disabled} onChange={event => setKsicQuery(event.target.value)} /></label>}
        {/* 대화(코치)에서는 '찾은 업종이에요…' 같은 안내를 빼고 추천 칩 하나를 눈에 띄게 한다(대표 요청 2026-10-24) — 여러 업종이 섞인 경우만 알린다 */}
        {ksicShown.length > 0 && (!coach || snapshot.structure?.fallback === "compound") && <p className={styles.ksicLead}>{snapshot.structure?.fallback === "compound" ? "여러 업종이 섞여 있어요. 가장 가까운 업종을 먼저 정할까요?" : recommendFirst ? "이야기해 주신 내용과 가까운 업종이에요. 맞는 걸 눌러 주세요." : "이야기해 주신 내용과 가까운 업종이에요."}</p>}
        {ksicSearchable(ksicQuery.trim()) && ksicSearched && ksicShown.length === 0 && <p className={styles.ksicLead}>{ksicSearch.failed ? "업종 검색이 잠시 연결되지 않았어요. 아래에서 골라 주시거나 잠시 후 다시 입력해 주세요." : coach ? "맞는 업종을 못 찾았어요. 다른 이름으로 찾거나 아래에서 골라 주세요." : "맞는 업종이 없으면 아래 11개 중에서 골라도 됩니다."}</p>}
        <div className={styles.ksicChips}>{ksicShown.map((item, index) => {
          // 첫 후보에 '추천'을 단다 — 대화(코치)에서는 검색 결과도 가장 가까운 첫 후보를 추천으로 강조해 바로 누르게 한다
          const recommended = index === 0 && (coach ? ksicShown.length > 0 && !draft.ksic : recommendFirst && !ksicSearchable(ksicQuery.trim()));
          return <button key={item.code} type="button" className={styles.ksicChip} data-recommended={recommended || undefined} aria-pressed={draft.ksic === item.code} disabled={disabled} onClick={() => send({ ...draft, ...(coach ? { text: "" } : {}), custom: false, selected: [item.sector], unknown: false, ksic: item.code, ksicName: item.name })}><strong>{recommended && <em className={styles.ksicBadge}>추천</em>}{item.name}{ksicNameHint(item.code) && <small className={styles.ksicHint}> ({ksicNameHint(item.code)})</small>}</strong><span>{item.path.split(" › ").slice(0, 2).map(part => part.replace(/;.*$/, "")).join(" › ")}</span></button>;
        })}</div>
        {recommendFirst && <button className={styles.textButton} type="button" disabled={disabled} aria-expanded="false" aria-controls="intake-industry-options" onClick={() => setManualIndustry(true)}><ListFilter size={16} aria-hidden="true" />목록에 없으면 직접 선택하기</button>}
      </div>}
      {suggestionCard && <div className={styles.industrySuggestion} role="group" aria-label="추천 업종">
        <p className={styles.suggestionReason}>입력하신 사업 내용을 보면 이 업종에 가까워 보여요. 맞는지 확인해 주세요.</p>
        <div className={styles.suggestedIndustry}><CheckCircle2 size={23} aria-hidden="true" /><strong>{suggested.label}</strong></div>
        <div className={styles.suggestionActions}>
          <button className={styles.primaryButton} type="button" disabled={disabled} aria-pressed={draft.selected.includes(suggested.value)} onClick={() => send({ ...draft, custom: false, selected: [suggested.value], unknown: false, ksic: undefined })}>이 업종 선택<Check size={17} aria-hidden="true" /></button>
          <button className={styles.textButton} type="button" disabled={disabled} aria-expanded="false" aria-controls="intake-industry-options" onClick={() => setManualIndustry(true)}><ListFilter size={16} aria-hidden="true" />직접 선택하기</button>
        </div>
      </div>}
      {suggested && manualIndustry && <button type="button" className={styles.textButton} disabled={disabled} onClick={() => setManualIndustry(false)}>추천 업종 보기</button>}
      {choice && !showSuggested && unknownFit && <p className={styles.fitNote}>{resourceFitLine(unknownFit)}</p>}
      {choice && !showSuggested && groups.map((group, index) => revealed(index) && <fieldset key={group.name ?? index} id={question.id === "industry" ? "intake-industry-options" : undefined} className={styles.options} data-step={groups.length > 1 ? index + 1 : undefined}>
        <legend className={groups.length > 1 && group.name ? styles.stepLegend : styles.srOnly}>{groups.length > 1 && group.name ? groupTitle(group.name) : question.label}</legend>
        {group.options.map(option => {
          const idea = candidate ? snapshot.candidateIdeas.find(item => item.id === option.value) : undefined;
          return <div key={option.value} className={idea ? styles.ideaOption : undefined} data-selected={draft.selected.includes(option.value)}><label className={styles.option} data-selected={draft.selected.includes(option.value)}>
            <input type={question.kind === "multi" ? "checkbox" : "radio"} name={`intake-${question.id}`} value={option.value} checked={draft.selected.includes(option.value)} disabled={inChat && disabled} onChange={() => choose(option.value)}
              {...coach && question.kind === "single" ? {
                onKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => radioKey(event, option.value),
                onKeyUp: () => { arrowPick.current = false; },
                // 이미 골라 둔 답을 다시 누르거나 Space를 누르면 바뀌는 게 없어 change가 오지 않는다 — 그때 보낸다
                onClick: () => { if (!arrowPick.current && draft.selected.includes(option.value)) sendPicked(option.value); },
              } : {}} />
            <span><strong>{option.label}</strong>{option.hint && <small className={styles.optionHint}>{option.hint}</small>}{idea && <><span className={styles.optionDescription}>{chatTextPreview(idea.description) ?? idea.description}</span>{idea.resourceFit?.status !== "unknown" && <ResourceFitDetails fit={idea.resourceFit} compact />}{idea.retained && <small>앞서 고른 사업이에요 · 바뀐 조건에 맞는지 한 번 더 봐 주세요</small>}</>}</span>
          </label>{idea && <details className={styles.disclosure}><summary>{option.label} 자세히 보기</summary><p>{idea.description}</p>{idea.reasons.length > 0 && <p className={styles.optionReason}>{idea.reasons.join(" · ")}</p>}{idea.cautions.length > 0 && <p className={styles.optionCaution}>미리 알아 둘 점: {idea.cautions.join(" ")}</p>}<ResourceFitDetails fit={idea.resourceFit} /></details>}</div>;
        })}
      </fieldset>)}
      {/* 여러 개 고르는 질문은 입력창의 보내기 하나로 보낸다(소유자 결정 2026-10-09) — 칩 옆 '다 골랐어요'를 두면 보낼 곳이 둘이라 헷갈렸다 */}
      {coach && choice && question.kind === "multi" && draft.selected.length > 0 && <p className={styles.multiSendHint} role="status">다 고르면 ↑ 보내기를 눌러 주세요</p>}
      {candidate && (inChat
        ? <div className={styles.chipRow}><button type="button" className={styles.chip} aria-pressed={draft.custom} data-selected={draft.custom || undefined} disabled={disabled} onClick={() => { onChange({ ...draft, custom: !draft.custom, selected: [], unknown: false, ksic: undefined }); if (!draft.custom) onComposer?.(); }}>직접 적을래요</button></div>
        : <label className={styles.customToggle}><input type="checkbox" checked={draft.custom} onChange={event => onChange({ ...draft, custom: event.target.checked, selected: [], unknown: false, ksic: undefined })} />직접 생각한 사업 적기</label>)}
      {hybrid && <HybridChips question={question} draft={draft} disabled={disabled} groups={groups} revealed={revealed} suggestions={inChat ? suggestions : undefined} onChange={onChange} coach={coach} onSend={send} />}
      {ticket && <AmountLadder question={question} ranges={ticketRanges} disabled={disabled} staging={inChat} exactLabel="정확한 금액 알아요 (기록 있음)" onCommit={commit} onRange={range => stage(`${range.label} (예상)`)} onExact={amount => stage(`${formatWon(amount)} (실제 기록)`)} />}
      {prefill && <div className={styles.chipStep} role="group" aria-label="문장 시작 선택">
        <div className={styles.chipRow}>{options.map(option => <button key={option.value} type="button" className={styles.chip} data-selected={draft.text.trim() === option.label || undefined} disabled={disabled} onClick={() => { onChange({ ...draft, custom: false, selected: [], unknown: false, text: option.label }); onComposer?.("○○"); }}>{option.label}</button>)}</div>
        {!question.hint && <p className={styles.chipHelp}>탭하면 입력창에 채워져요. ○○ 자리는 직접 바꾸고 보내 주세요.</p>}
      </div>}
      {basisOptions.length > 0 && <div className={styles.chipStep} role="group" aria-label="가격 기준">
        <p className={styles.stepLegend}>가격 기준</p>
        <div className={styles.chipRow}>{basisOptions.map(option => <button key={option.value} type="button" className={styles.chip} aria-pressed={draft.selected.includes(option.value)} data-selected={draft.selected.includes(option.value) || undefined} disabled={disabled} onClick={() => onChange({ ...draft, custom: false, unknown: false, selected: [option.value] })}>{option.label}</button>)}</div>
      </div>}
      {numeric && question.id === "price" && snapshot.intake.mode !== "operating" && <CostPriceHelper disabled={disabled} onCommit={(price, unitCost) => { onCarry?.("structure.unitCost", formatWon(unitCost)); commit(price); }} />}
      {numeric && !candidate && (question.unit === "원"
        ? (!basisOptions.length || basis) && <AmountLadder key={basis ?? "ladder"} quick={coach} question={question} ranges={ranges} legend={months && months > 1 ? `${months}개월 합계 기준` : undefined} disabled={disabled} staging={inChat} onCommit={commit} />
        : <NumberQuick question={question} draft={draft} presets={numberPresets(question)} disabled={disabled} staging={inChat} onChange={onChange} onCommit={commit} />)}
      {period && <div className={styles.periodPicker} role="group" aria-label="실적 기간 선택">
        <div className={styles.presetChips}>
          {PERIOD_PRESETS.map(preset => <button key={preset.id} type="button" className={styles.presetChip} aria-pressed={draft.text === periodPresetRange(preset.id)} disabled={disabled} onClick={() => { setCustomPeriod(false); commit(periodPresetRange(preset.id)); }}>{preset.label}</button>)}
          <button type="button" className={styles.presetChip} data-selected={customPeriod || undefined} aria-expanded={customPeriod} aria-controls="intake-period-range" disabled={disabled} onClick={() => setCustomPeriod(value => !value)}>직접 선택</button>
        </div>
        {customPeriod && <div id="intake-period-range" className={styles.dateRange}>
          <label><span>시작일</span><input type="date" value={periodStart} max={periodEnd || undefined} disabled={disabled} onChange={event => setPeriodStart(event.target.value)} /></label>
          <label><span>종료일</span><input type="date" value={periodEnd} min={periodStart || undefined} disabled={disabled} onChange={event => setPeriodEnd(event.target.value)} /></label>
          <button type="button" className={styles.secondaryButton} disabled={disabled || !customPeriodValid} onClick={() => commit(`${periodStart} / ${periodEnd}`)}>{inChat ? "기간 선택" : "이 기간으로 저장"}<Check size={17} aria-hidden="true" /></button>
        </div>}
      </div>}
      {inChat && <button type="button" className={styles.unknownChoice} aria-pressed={!!draft.unknown} disabled={disabled} onClick={() => (draft.unknown ? onChange : send)({ ...draft, text: "", custom: false, selected: [], unknown: !draft.unknown, ksic: undefined })}><strong>{coach ? "잘 모르겠어요" : "아직 정하지 않았어요"}</strong></button>}
      {inChat && draft.unknown && <details className={styles.undecidedHelp}><summary>{undecided.examples.length ? "예시를 보고 정할래요" : "무엇을 정하는 건가요?"}</summary>
        <p>{undecided.text}</p>
        {undecided.examples.length > 0 && <div className={styles.chipRow} role="group" aria-label={`${question.label} 예시`}>{undecided.examples.map(example => <button key={example} type="button" className={styles.chip} disabled={disabled} onClick={() => onChange({ ...draft, text: example, selected: [], unknown: false, custom: false })}>{example}</button>)}</div>}
      </details>}
      {!choice && !inChat && <div className={styles.answerField}>
        <label className={styles.srOnly} htmlFor={`intake-answer-${question.id}`}>{candidate && draft.custom ? "직접 생각한 사업" : question.label}</label>
        {question.kind === "number" ? <div className={styles.numberField}><input id={`intake-answer-${question.id}`} type="text" inputMode="decimal" autoComplete="off" maxLength={80} value={draft.text} onChange={event => onChange({ ...draft, text: event.target.value })} aria-describedby={hintId} /><span>{question.unit}</span></div>
          : <textarea id={`intake-answer-${question.id}`} rows={5} maxLength={1200} value={draft.text} onChange={event => onChange({ ...draft, text: event.target.value })} aria-describedby={hintId} />}
        <p className={styles.fieldHint} id={hintId}>{question.kind === "number" ? `단위: ${question.unit || "숫자"}${question.period ? ` · ${question.period}` : ""}` : `${draft.text.length.toLocaleString("ko-KR")} / 1,200자`}</p>
      </div>}
      <div className={styles.formActions}>
        {!inChat && <button className={styles.secondaryButton} type="button" disabled={disabled} onClick={() => onAnswer(null, true, question.id)}>아직 정하지 않았어요</button>}
        {!inChat && <button className={styles.primaryButton} type="submit" disabled={disabled || !valid}>{editing ? "답변 수정" : "답변 저장"}<ArrowRight size={18} aria-hidden="true" /></button>}
      </div>
      </div>
    </form>
    {cardFoot}
  </section>;
}

/** hybrid_text_chips (spec §2): step chips write the assembled sentence into `draft.text`; the composer only supplements it. */
function HybridChips({ question, draft, disabled, groups, revealed, suggestions, onChange, coach = false, onSend }: {
  question: IntakeQuestion; draft: AnswerDraft; disabled: boolean; groups: ReturnType<typeof optionGroups>; revealed: (index: number) => boolean;
  /**
   * 이 사업에 맞춘 AI 추천 — 따로 상자에 두면 아래 선택지와 겹쳐 보여 무엇을 골라야 할지 헷갈렸다(소유자 피드백 2026-10-22).
   * 첫 선택지 줄 맨 앞에 ✨ 표시를 단 칩으로 섞어 두고, 같은 한도(최대 N개)로 함께 센다. 고르면 답 문장 조각으로 합쳐진다.
   */
  suggestions?: QuestionSuggestions; onChange: (value: AnswerDraft) => void;
  /** Coach chat: send as soon as every step is filled; a partial pick is sent from the composer, where the picked chips appear as text. */
  coach?: boolean; onSend?: (value: AnswerDraft) => void;
}) {
  const limit = chipLimit(question.id);
  const aiItems = suggestions && !suggestions.pending ? suggestions.items : [];
  const pieces = unmatchedPieces(question, draft.text);
  const extraPicked = aiItems.filter(item => pieces.includes(item)).length;
  // 추천은 첫 선택지 줄(필터가 아닌 첫 단계)에 붙는다
  const aiGroup = groups.findIndex(group => !isFilterGroup(group.name));
  // 한 개만 고르는 질문은 추천끼리 바꿔 끼운다
  const toggleSuggestion = (item: string) => {
    const nextPieces = pieces.includes(item) ? pieces.filter(piece => piece !== item) : [...(limit > 1 ? pieces : pieces.filter(piece => !aiItems.includes(piece))), item];
    onChange({ ...draft, custom: false, unknown: false, text: assembleHybridText(question, draft.selected, nextPieces) });
  };
  const next = (selected: string[]): AnswerDraft => ({ ...draft, custom: false, unknown: false, selected, text: assembleHybridText(question, selected, pieces) });
  const update = (selected: string[]) => {
    const value = next(selected);
    (coach && onSend && !extraPicked && hybridComplete(question, selected) ? onSend : onChange)(value);
  };
  // 덜 고른 답은 입력창(코치 채팅에서는 고른 칩이 글로 채워진다)의 보내기로 보낸다 — 칩 옆에 '이대로 보내기'를 따로 두면 보낼 곳이 둘이라 헷갈린다(소유자 피드백 2026-10-09)
  const tap = (value: string) => update(toggleChip(question, draft.selected, value));
  const picked = (group: string) => (question.options ?? []).find(option => option.group === group && draft.selected.includes(option.value));
  // Count step: capacity after its unit chip, goal for an "N건" metric. The count lives in draft.selected as "#n".
  const countUnit = question.id === "capacity" ? picked(CHIP_GROUPS.unit)?.label : question.id === "goal" && metricNeedsCount(picked(CHIP_GROUPS.metric)?.label) ? "건" : undefined;
  const count = selectedCount(draft.selected);
  return <div className={styles.chipSteps}>{[...groups.map((group, index) => {
    if (!revealed(index)) return null;
    const filter = isFilterGroup(group.name);
    const stepLimit = filter ? 1 : limit;
    const picked = group.options.filter(option => draft.selected.includes(option.value)).length + (filter ? 0 : extraPicked);
    const title = groupTitle(group.name);
    const withAi = index === aiGroup && !!suggestions;
    return <div key={group.name ?? index} className={styles.chipStep} role="group" aria-label={title || question.label} data-step={groups.length > 1 ? index + 1 : undefined}>
      {(title || stepLimit > 1 || withAi) && <p className={styles.stepLegend}>{title}{stepLimit > 1 && <span>{`최대 ${stepLimit}개 · ${picked}/${stepLimit}`}</span>}{withAi && <span className={styles.suggestionNote} role="status"><Sparkles size={12} aria-hidden="true" />{suggestions?.pending ? "이 사업에 맞춘 추천을 고르고 있어요" : "표시는 이 사업에 맞춘 추천이에요"}</span>}</p>}
      <div className={styles.chipRow}>{withAi && suggestions?.pending && [180, 140].map(width => <span key={`ai-wait-${width}`} className={styles.suggestionSkeleton} style={{ width }} aria-hidden="true" />)}{index === aiGroup && aiItems.map(item => {
        const selected = pieces.includes(item);
        return <button key={`ai-${item}`} type="button" className={`${styles.chip} ${styles.suggestionChip}`} aria-pressed={selected} data-selected={selected || undefined} disabled={disabled || !selected && stepLimit > 1 && picked >= stepLimit} onClick={() => toggleSuggestion(item)}><span className={styles.suggestionLabel}><Sparkles size={13} aria-hidden="true" />{item}<span className={styles.srOnly}> (맞춤 추천)</span></span></button>;
      })}{group.options.map(option => {
        const selected = draft.selected.includes(option.value);
        return <button key={option.value} type="button" className={styles.chip} aria-pressed={selected} data-selected={selected || undefined} disabled={disabled || !selected && stepLimit > 1 && picked >= stepLimit} onClick={() => tap(option.value)}>{goalChipLabel(question.id, option.label)}{option.hint && <small className={styles.chipHint}>{option.hint}</small>}</button>;
      })}</div>
    </div>;
  }), countUnit !== undefined && <CountStep key="count" question={question} unit={countUnit} count={count} disabled={disabled} onCount={value => update(withCount(draft.selected, value))} />]}</div>;
}

/**
 * 목표 칩의 'N원'·'N건' 자리표는 칩에서 감춘다 — 금액·건수는 바로 다음 단계에서 고른다('월 매출 N원' → '목표 월 매출').
 * 값(답 문장 조립)은 그대로 'N원'을 쓴다.
 */
const goalChipLabel = (questionId: string, label: string) => questionId !== "goal" ? label : label === "월 매출 N원" ? "목표 월 매출" : label.replace(/\s*N원/, "").replace(/\s*N건/, " 건수");

/** Preset chips + stepper for a count inside a hybrid answer; the composer sends the final answer. */
function CountStep({ question, unit, count, disabled, onCount }: { question: IntakeQuestion; unit: string; count: number | undefined; disabled: boolean; onCount: (value: number | undefined) => void }) {
  const presetQuestion = { id: question.id, unit, period: question.period };
  const presets = numberPresets(presetQuestion);
  const step = stepFor(count ?? 0, unit);
  return <div className={styles.chipStep} role="group" aria-label={`${unit} 수량`}>
    <p className={styles.stepLegend}>{question.id === "goal" ? "목표 건수" : `수량 (${unit})`}</p>
    {presets.length > 0 && <div className={styles.chipRow}>{presets.map(preset => <button key={preset} type="button" className={styles.chip} aria-pressed={count === preset} data-selected={count === preset || undefined} disabled={disabled} onClick={() => onCount(count === preset ? undefined : preset)}>{numberPresetLabel(presetQuestion, preset)}</button>)}</div>}
    <div className={styles.stepper} role="group" aria-label="수량 조정">
      <button type="button" className={styles.stepButton} aria-label={`${step}${unit} 줄이기`} disabled={disabled || (count ?? 0) <= 0} onClick={() => onCount(Math.max(0, (count ?? 0) - stepFor(Math.max(0, (count ?? 0) - 1), unit)))}>−</button>
      <label className={styles.stepValue}><span className={styles.srOnly}>수량</span><input type="text" inputMode="numeric" autoComplete="off" maxLength={9} placeholder="0" value={count === undefined ? "" : String(count)} onChange={event => { const digits = event.target.value.replace(/[^\d]/g, ""); onCount(digits ? Number(digits) : undefined); }} /><span>{unit}</span></label>
      <button type="button" className={styles.stepButton} aria-label={`${step}${unit} 늘리기`} disabled={disabled} onClick={() => onCount((count ?? 0) + step)}>+</button>
    </div>
  </div>;
}

/** Presets and the stepper stage the same answer as the chat composer. */
function NumberQuick({ question, draft, presets, disabled, staging, onChange, onCommit }: {
  question: IntakeQuestion; draft: AnswerDraft; presets: number[]; disabled: boolean; staging: boolean; onChange: (value: AnswerDraft) => void; onCommit: (value: IntakeValue) => void;
}) {
  const unit = question.unit ?? "";
  const numericText = draft.text.trim().replace(new RegExp(`\\s*${unit}$`), "");
  const current = numericText && /^\d+(?:\.\d+)?$/.test(numericText) ? Number.parseFloat(numericText) : null;
  const max = question.fieldKey === "hoursPerWeek" ? 168 : Number.POSITIVE_INFINITY;
  const setValue = (next: number) => onChange({ ...draft, unknown: false, text: String(Math.min(max, Math.max(0, next))) });
  const step = stepFor(current ?? 0, unit);
  return <div className={styles.numberQuick}>
    {presets.length > 0 && <div className={styles.chipRow} role="group" aria-label="자주 고르는 값">{presets.map(preset => <button key={preset} type="button" className={styles.chip} data-selected={current === preset || undefined} disabled={disabled} onClick={() => onCommit(numberAnswer(preset, unit))}>{numberPresetLabel(question, preset)}</button>)}</div>}
    <div className={styles.stepper} role="group" aria-label="값 조정">
      <button type="button" className={styles.stepButton} aria-label={`${step}${unit} 줄이기`} disabled={disabled || (current ?? 0) <= 0} onClick={() => setValue((current ?? 0) - stepFor(Math.max(0, (current ?? 0) - 1), unit))}>−</button>
      <label className={styles.stepValue}><span className={styles.srOnly}>{question.label}</span><input type="text" inputMode="decimal" autoComplete="off" maxLength={12} placeholder="0" value={numericText} disabled={disabled} onChange={event => onChange({ ...draft, unknown: false, text: event.target.value.replace(/[^\d.]/g, "") })} /><span>{unit}{question.period ? ` / ${question.period}` : ""}</span></label>
      <button type="button" className={styles.stepButton} aria-label={`${step}${unit} 늘리기`} disabled={disabled || (current ?? 0) >= max} onClick={() => setValue((current ?? 0) + step)}>+</button>
      {!staging && <button type="button" className={styles.primaryButton} disabled={disabled || current === null || current > max} onClick={() => current !== null && onCommit(numberAnswer(current, unit))}>이 값으로 저장</button>}
    </div>
  </div>;
}

/** range_chips_with_exact (spec §2): a won ladder, then lower / upper / exact (만원 keypad with a 원 toggle). Only "0원" sends from step 1. */
/** 원가로 판매가 계산 — 1개당 원가와 원가 비율을 고르면 판매가를 제안하고, 누르면 가격 답으로 넣는다. 넣은 원가는 다음 변동비 질문에 미리 채운다. */
function CostPriceHelper({ disabled, onCommit }: { disabled: boolean; onCommit: (price: IntakeValue, unitCost: number) => void }) {
  const [costText, setCostText] = useState("");
  const [ratio, setRatio] = useState<number>(30);
  const cost = /^\d+$/.test(costText.replace(/,/g, "")) ? Number(costText.replace(/,/g, "")) : null;
  const result = cost ? suggestPriceFromCost(cost, ratio) : null;
  return <details className={styles.costHelper}>
    <summary>가격을 모르겠다면 원가로 계산해 보기</summary>
    <p className={styles.chipHelp}>상품 1개(서비스 1건)를 만드는 데 드는 재료·포장·외주비를 넣고, 판매가에서 원가가 차지할 비율을 골라 주세요. 업종마다 다르니 내 원가 구조에 맞는 비율을 고르면 돼요.</p>
    <label className={styles.costHelperInput}><span>1개당 원가</span><input inputMode="numeric" value={costText} placeholder="예: 1500" disabled={disabled} onChange={event => setCostText(event.target.value.replace(/[^\d,]/g, ""))} /><em>원</em></label>
    <div className={styles.chipRow} role="group" aria-label="원가 비율">{COST_RATIO_PRESETS.map(value => <button key={value} type="button" className={styles.chip} aria-pressed={ratio === value} data-selected={ratio === value || undefined} disabled={disabled} onClick={() => setRatio(value)}>원가 {value}%</button>)}</div>
    {result && <div className={styles.costHelperResult}>
      <p>제안 판매가 <strong>{formatWon(result.price)}</strong> · 1개 팔 때마다 원가를 빼고 {formatWon(result.margin)}이 남아요 (원가 {ratio}% 기준).</p>
      <button type="button" className={styles.secondaryButton} disabled={disabled} onClick={() => cost && onCommit(formatWon(result.price), cost)}>이 가격으로 입력<Check size={17} aria-hidden="true" /></button>
    </div>}
  </details>;
}

function AmountLadder({ question, ranges, legend, disabled, staging, exactLabel = "정확히 입력", onCommit, onRange, onExact, quick = false }: {
  question: IntakeQuestion; ranges: AmountRange[]; legend?: string; disabled: boolean; staging: boolean; exactLabel?: string;
  /** Coach chat: one tap on a range saves its middle value (owner decision 2026-10-07); exact amounts go through the composer. */
  quick?: boolean;
  /** Number mode sends wonAnswer() through onCommit; text mode (onRange + onExact) writes into the draft instead. */
  onCommit: (value: IntakeValue) => void; onRange?: (range: AmountRange) => void; onExact?: (amount: number) => void;
}) {
  const [rangeIndex, setRangeIndex] = useState<number | null>(null);
  const [keypad, setKeypad] = useState(ranges.length === 0);
  const [unitScale, setUnitScale] = useState<10000 | 1>(10000);
  const [amountText, setAmountText] = useState("");
  const range = rangeIndex === null ? null : ranges[rangeIndex];
  const openKeypad = (start: number | null) => {
    if (start !== null && start > 0) { const scale = start % 10000 === 0 ? 10000 : 1; setUnitScale(scale); setAmountText(String(start / scale)); } else setAmountText("");
    setKeypad(true);
    /* 범위 하한을 미리 넣어 두면 그 뒤에 이어 쳐서 30006000 처럼 되기 쉬웠다 — 열자마자 전체 선택해 바로 덮어쓰게 */
    window.requestAnimationFrame(() => { const input = document.getElementById(`intake-exact-${question.id}`) as HTMLInputElement | null; input?.focus(); input?.select(); });
  };
  const pick = (index: number) => {
    const item = ranges[index];
    if (onRange) { onRange(item); return; } // text mode: the range label itself becomes the answer text
    if (item.min === 0 && item.max === 0 || item.max === 0) return onCommit("0원");
    if (quick) return onCommit(wonAnswer(rangeMidpoint(item)));
    setRangeIndex(index); setKeypad(false);
  };
  const parsed = /^\d+(?:\.\d+)?$/.test(amountText.replace(/,/g, "")) ? Number.parseFloat(amountText.replace(/,/g, "")) : null;
  const amount = parsed === null ? null : Math.round(parsed * unitScale);
  const logChips = range ? openEndPresets(range) : [];
  return <div className={styles.amountLadder} data-stage={keypad ? "exact" : range ? "bounds" : "ranges"}>
    {legend && !range && !keypad && <p className={styles.stepLegend}>{legend}</p>}
    {!range && ranges.length > 0 && <div className={styles.chipRow} role="group" aria-label="금액 범위">{ranges.map((item, index) => <button key={item.label} type="button" className={styles.chip} disabled={disabled} onClick={() => pick(index)}>{item.label}</button>)}</div>}
    {!range && !keypad && onRange && <div className={styles.chipRow}><button type="button" className={styles.chip} disabled={disabled} onClick={() => openKeypad(null)}>{exactLabel}</button></div>}
    {range && <div className={styles.chipStep} role="group" aria-label={`${range.label} 안에서 고르기`}>
      <p className={styles.stepLegend}>{range.label}<button type="button" className={styles.textButton} disabled={disabled} onClick={() => { setRangeIndex(null); setKeypad(false); }}>범위 다시 고르기</button></p>
      <div className={styles.chipRow}>
        {range.min !== null && range.min > 0 && <button type="button" className={styles.chip} disabled={disabled} onClick={() => onCommit(wonAnswer(range.min!))}>적게 잡아 {wonLabel(range.min)}</button>}
        {range.max !== null && <button type="button" className={styles.chip} disabled={disabled} onClick={() => onCommit(wonAnswer(range.max!))}>많게 잡아 {wonLabel(range.max)}</button>}
        {logChips.slice(1).map(value => <button key={value} type="button" className={styles.chip} disabled={disabled} onClick={() => onCommit(wonAnswer(value))}>{wonLabel(value)}</button>)}
        {!keypad && <button type="button" className={styles.chip} disabled={disabled} onClick={() => openKeypad(range.min)}>{exactLabel}</button>}
      </div>
    </div>}
    {keypad && <div className={styles.keypad} role="group" aria-label="정확한 금액 입력">
      <div className={styles.keypadRow}>
        <input id={`intake-exact-${question.id}`} type="text" inputMode="decimal" autoComplete="off" maxLength={14} placeholder="0" disabled={disabled} aria-label={`정확한 금액 (${unitScale === 10000 ? "만원" : "원"} 단위)`} value={amountText} onChange={event => setAmountText(event.target.value.replace(/[^\d.,]/g, ""))} />
        <div className={styles.unitToggle} role="group" aria-label="입력 단위">
          <button type="button" aria-pressed={unitScale === 10000} disabled={disabled} onClick={() => { if (unitScale !== 10000) { setUnitScale(10000); setAmountText(amount !== null && amount % 10000 === 0 ? String(amount / 10000) : ""); } }}>만원</button>
          <button type="button" aria-pressed={unitScale === 1} disabled={disabled} onClick={() => { if (unitScale !== 1) { setUnitScale(1); setAmountText(amount !== null ? String(amount) : ""); } }}>원 단위</button>
        </div>
      </div>
      <p className={styles.keypadPreview}>{amount !== null ? `= ${formatWon(amount)}${question.period ? ` / ${question.period}` : ""}` : "숫자만 입력해 주세요"}</p>
      <button type="button" className={styles.secondaryButton} disabled={disabled || amount === null} onClick={() => { if (amount === null) return; if (onExact) { onExact(amount); setKeypad(false); } else onCommit(wonAnswer(amount)); }}>{staging ? "금액 선택" : onExact ? "이 금액으로 적기" : "이 금액으로 저장"}<Check size={17} aria-hidden="true" /></button>
    </div>}
  </div>;
}


/**
 * "채팅으로 수정하기" turn: a short intro with examples, the AI's tidy-up while it runs, then the proposed changes
 * to confirm or cancel. Requests outside this business never reach the AI (server-side filter).
 */
export function EditChatTurn({ snapshot, disabled, onSend, onApply, onDismiss, pro = false, chapters }: { snapshot: IntakeSnapshot; disabled: boolean; onSend: (text: string) => void; onApply: () => void; onDismiss: () => void;
  /** 작업실 PC: 카드 위 작업 기록('바꿀 곳 N군데를 찾았어요') · 머리의 군데 수 · 지금 → 바꿀 글 화살표. 예시 칩은 입력창 위 추천 줄이 맡는다 */
  pro?: boolean;
  /** 작업실 PC: 계획서 칸이 이 제안의 바뀔 글을 찾은 장('1장 사업 개요') — 바뀌는 곳 아래 작은 회색 칩. 계획서 칸을 안 열었으면 없다 */
  chapters?: string[] }) {
  const job = snapshot.intake.job?.kind === "edit" ? snapshot.intake.job : null;
  const running = !!job && ["queued", "running"].includes(job.status);
  const pending = !!job && job.status === "complete" && !!job.proposal?.length && !job.proposalStatus;
  const price = snapshot.intake.answers.price;
  const examples = editExamples(price?.status === "answered" ? price.value : null);
  return <section className={styles.editTurn} aria-label="계획서 수정" data-edit-chat>
    {/* 장의 문장을 다시 쓰는 게 아니라 사업 내용(답변)을 바꾼다 — 약속과 하는 일이 같게(여정 점검 2026-10-23) */}
    {!job && <div className={styles.assistantMessage}><p>바꾸고 싶은 사업 내용(가격·고객·상품·목표 등)을 말씀해 주세요.</p></div>}
    {running && <JobProgress snapshot={snapshot} announce variant="chat" />}
    {pending && pro && <WorkLog items={[editFoundItem(job!.proposal!.length)]} />}
    {pending && <div className={styles.changeCard} data-edit-proposal>
      <b>{pro && <PencilLine size={14} className={styles.changeIcon} aria-hidden="true" />}이렇게 바꿀게요</b>{/* 군데 수는 바로 위 작업 기록(바꿀 곳 N군데를 찾았어요)이 말한다 — 머리에서 또 말하지 않는다(PC 점검 2026-10-24) */}
      {job!.proposal!.map(change => {
        const question = snapshot.questions.find(item => item.id === change.questionId);
        const current = snapshot.intake.answers[change.questionId];
        const before = question && current?.status === "answered" ? summaryAnswerText(question, current.value, snapshot.candidateIdeas) : "";
        const after = question ? summaryAnswerText(question, change.value, snapshot.candidateIdeas) : String(change.value);
        return <p key={change.questionId}><span>{question?.label ?? change.questionId}</span>{before && <s>{before}</s>}{pro && before && <ArrowRight size={13} className={styles.changeArrow} aria-hidden="true" />}<strong>{after}</strong></p>;
      })}
      {pro && !!chapters?.length && <ul className={styles.changeChapters} aria-label="계획서에서 바뀌는 장">{chapters.map(chapter => <li key={chapter}>{chapter}</li>)}</ul>}
      <div className={styles.chipRow}><button type="button" className={`${styles.chip} ${styles.chipStrong}`} disabled={disabled} onClick={onApply}>바꾸기</button><button type="button" className={styles.chip} disabled={disabled} onClick={onDismiss}>취소</button></div>
    </div>}
    {!running && !pending && !pro && <div className={styles.chipRow}>{examples.map(text => <button key={text} type="button" className={styles.chip} disabled={disabled} onClick={() => onSend(text)}>{text}</button>)}</div>}
  </section>;
}

/**
 * After the plan document exists the chat is a record of the questions. 작업실에서는 입력창이 늘 열려 있어(onChatEdit)
 * 바꿀 내용·궁금한 점을 바로 적으면 되고, 예전 화면에서는 대화로 고치기 화면으로 보낸다.
 * 고치는 길의 이름은 '대화로 고치기' · '직접 고치기' 두 가지로만 부른다(계획서 칸과 같다).
 */
export function DocumentLockedTurn({ planId, chatEdit, onChatEdit, pro = false }: { planId: string; chatEdit: boolean; onChatEdit?: () => void;
  /** 작업실 PC: 안내 아래 복사 줄만 두고 단추 줄은 뺀다 — 계획서 보기는 칸 탭, 대화로 고치기는 늘 열린 입력창, 직접 고치기는 계획서 칸에 있다 */
  pro?: boolean }) {
  const id = encodeURIComponent(planId);
  /* 한 문장만 — 입력창 · 고치기 단추가 바로 아래에 있어 무엇을 할지 따로 말하지 않는다(r37 글 점검) */
  const text = "사업계획서를 만들었어요.";
  if (pro) return <section className={styles.lockedTurn} aria-label="사업계획서 완성" data-document-locked>
    <div className={styles.assistantMessage}><p>{text}</p></div>
    <MessageMeta text={text} />
  </section>;
  return <section className={styles.lockedTurn} aria-label="사업계획서 완성" data-document-locked>
    <div className={styles.assistantMessage}><p>{text}</p></div>
    {/* 다른 화면으로 가는 칩은 끝에 ›(휴대폰 점검 2026-10-24) */}
    {/* 다 만든 뒤 할 일은 '계획서 보기'가 먼저다 — 예전엔 세 단추가 같은 무게라 무엇을 누를지 몰랐다(여정 점검 2026-10-22) */}
    <div className={styles.chipRow}>
      <Link className={`${styles.chip} ${styles.chipStrong}`} href={`/plan/document?planId=${id}`}>계획서 보기<ChevronRight size={16} aria-hidden="true" /></Link>
      {chatEdit && (onChatEdit ? <button type="button" className={styles.chip} onClick={onChatEdit}>대화로 고치기</button> : <Link className={styles.chip} href={`/plan/chat?planId=${id}&edit=chat`}>대화로 고치기<ChevronRight size={16} aria-hidden="true" /></Link>)}
      <Link className={styles.chip} href={`/plan/document?planId=${id}&edit=facts`}>직접 고치기<ChevronRight size={16} aria-hidden="true" /></Link>
    </div>
  </section>;
}

/*
 * 작업실 대화 칸: 이번에 사업계획서 작성이 끝나면 진행 카드 자리에 남기는 마무리 말 — 다음에 할 일 두 가지를 바로 고르게 한다.
 * '계획서 보기'는 오른쪽(휴대폰은 계획서 탭)을 보여 주고, '홈페이지 만들기'는 홈페이지 탭으로 간다.
 */
const FINISHED_TEXT = "사업계획서를 다 만들었어요. 계획서를 확인해 보시고, 이 내용으로 홈페이지도 바로 만들 수 있어요.";
export function GenerationFinishedTurn({ planId, onPlan, onHomepage, pro = false }: { planId: string; onPlan: () => void; onHomepage: () => void; pro?: boolean }) {
  return <section className={styles.lockedTurn} aria-label="사업계획서 작성 완료" data-generation-finished>
    <div className={styles.assistantMessage}><p>{FINISHED_TEXT}</p></div>
    {pro && <MessageMeta text={FINISHED_TEXT} />}
    <div className={styles.chipRow}>
      <button type="button" className={`${styles.chip} ${styles.chipStrong}`} onClick={onPlan}>계획서 보기</button>
      <button type="button" className={styles.chip} onClick={onHomepage}>홈페이지 만들기</button>
      <Link className={styles.chip} href={`/plan/document?planId=${encodeURIComponent(planId)}&edit=facts`}>직접 고치기<ChevronRight size={16} aria-hidden="true" /></Link>
    </div>
  </section>;
}

export function ChatSpeaker({ status }: { status?: string }) {
  return <span className={styles.chatSpeaker}><img src="/support-agent-avatar-2026.png" alt="" width="28" height="28" /><span>오늘창업</span>{status && <span className={styles.speakerStatus}>{status}</span>}</span>;
}

/** Messenger-style "typing" bubble; the dots only change brightness, so the layout never jumps. */
function TypingBubble() {
  return <span className={styles.typingBubble} aria-hidden="true"><i /><i /><i /></span>;
}

/** 화면 낭독기 안내('다음 질문을 준비하고 있어요')는 BusinessIntake의 늘 붙어 있는 알림 칸이 맡는다 — 내용과 같이 생기는 칸은 읽히지 않을 때가 있다. */
export function ReplyTyping() {
  return <div className={styles.replyTyping} data-reply-typing><ChatSpeaker /><TypingBubble /></div>;
}

export function ConversationText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const preview = chatTextPreview(text);
  if (!preview) return <p>{text}</p>;
  return <div className={styles.conversationText}>
    <p>{expanded ? text : preview}</p>
    <button type="button" className={styles.textButton} aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? "접기" : "전체 내용 보기"}</button>
  </div>;
}

/** businessDesignReply()가 만든 사업 방향 요약 글인지 — 이 두 소제목이 함께 있는 글은 설계 결과뿐이다. */
/** 답 말풍선 표기 — +/− 단추·연필로 넣은 숫자만 있는 답('25', '6000')도 요약 패널처럼 단위를 붙인다('25시간', '6,000원'). */
function bubbleAnswerText(question: IntakeQuestion | undefined, text: string) {
  if (question?.id === "period") return periodDisplay(text);
  if (/^\d{4,}원$/.test(text)) return formatWon(Number(text.slice(0, -1)));
  if (question?.kind !== "number" || !question.unit || !/^\d[\d,]*(\.\d+)?$/.test(text)) return text;
  // 원은 서버와 같은 규칙으로 읽는다 — '4.500'은 4,500원(4.5를 반올림한 '5원'이 아니다)
  const number = question.unit === "원" ? parseWonAmount(text) ?? NaN : Number(text.replace(/,/g, ""));
  if (!Number.isFinite(number)) return text;
  return question.unit === "원" ? formatWon(number) : `${number.toLocaleString("ko-KR")}${question.unit}`;
}

export const isDesignReplyText = (text: string) => text.includes("\n\n이렇게 제안한 이유\n") && text.includes("\n\n먼저 해볼 일 하나 · 선택 사항\n");

export function ConversationHistory({ snapshot, onEdit, receipt, readOnly = false, pro = false, log }: { snapshot: IntakeSnapshot; onEdit: (id: string) => void; receipt?: string; readOnly?: boolean;
  /** 작업실 PC: AI 답 아래 시각 · 복사 줄, 판매 가격과 비용을 다 답하면 '남는 돈을 계산했어요' 기록 */
  pro?: boolean;
  /** 작업실 PC: 그 시각(at) 뒤에 온 첫 메시지 앞에 끼우는 작업 기록(계획서 작성 등). 시각이 없거나 뒤 메시지가 없으면 대화 끝에 */
  log?: { at: string | null; node: ReactNode } }) {
  const lastUserId = [...snapshot.coach.messages].reverse().find(message => message.role === "user")?.id;
  const mode = { exploring: "아이디어를 찾고 있어요", startup: "생각한 사업이 있어요", operating: "사업을 운영 중이에요" }[snapshot.intake.mode];
  /*
   * 업종을 바꾸면(업종 확인의 [바꾸기]·연필로 다시 고르기) 마지막 업종 답만 보인다 — 예전엔 바꾸기 전 업종과 새 업종이
   * 같은 질문과 함께 두 번 쌓여 어느 쪽이 지금 업종인지 헷갈렸다(점검 2026-10-22). 바뀐 답 아래에 '업종을 바꿨어요'를 남긴다.
   */
  const industryLabel = `${getIntakeQuestion(snapshot.intake.mode, snapshot.intake.sector, "industry")?.label ?? "업종"}: `;
  const industryAnswerId = snapshot.intake.answers.industry?.messageId;
  const replacedIndustry = new Set(industryAnswerId && snapshot.coach.messages.some(message => message.id === industryAnswerId)
    ? snapshot.coach.messages.filter(message => message.role === "user" && message.id !== industryAnswerId && message.text.startsWith(industryLabel) && !snapshot.intake.notes.some(note => note.id.startsWith(`${message.id}:`))).map(message => message.id) : []);
  /*
   * 다른 답도 연필로 고치면 새 답이 대화 끝에 쌓인다 — 같은 질문의 예전 답 말풍선은 업종처럼 숨기고 새 답 아래에 '답을 바꿨어요'를 남긴다
   * (점검 r42: 예전 답 '근처 직장인'과 새 답이 같은 질문으로 두 번 보여 어느 쪽이 지금 답인지 헷갈렸다).
   */
  const replacedAnswers = new Map<string, string>();
  for (const question of snapshot.questions) {
    const currentId = snapshot.intake.answers[question.id]?.messageId;
    const currentIndex = currentId ? snapshot.coach.messages.findIndex(message => message.id === currentId) : -1;
    if (question.id === "industry" || currentIndex < 0) continue;
    for (const message of snapshot.coach.messages.slice(0, currentIndex)) {
      if (message.role === "user" && message.text.startsWith(`${question.label}: `) && !snapshot.intake.notes.some(note => note.id.startsWith(`${message.id}:`))) replacedAnswers.set(message.id, currentId!);
    }
  }
  const changedAnswerIds = new Set(replacedAnswers.values());
  // 대화로 고치기의 [바꾸기]가 적용한 답 — 메시지 번호가 '편집 요청 번호:순번'이고 같은 요청의 '바꿨어요' 답이 있다
  const appliedEdit = (id: string) => /:\d+$/.test(id) && snapshot.coach.messages.some(other => other.role === "assistant" && other.id === `${id.replace(/:\d+$/, "")}:reply` && other.text.startsWith("바꿨어요"));
  const margin = pro ? marginLogItem(snapshot) : null;
  const logTime = log?.at ? Date.parse(log.at) : NaN;
  let logPlaced = !log;
  const placeLog = (message: { id: string; at: string }, body: ReactNode) => {
    if (logPlaced || !Number.isFinite(logTime) || !(Date.parse(message.at) > logTime)) return body;
    logPlaced = true;
    return <Fragment key={`log:${message.id}`}>{log!.node}{body}</Fragment>;
  };
  return <div className={styles.chatHistory} aria-label="지금까지의 대화">
    <div className={styles.assistantMessage}><ChatSpeaker /><p>지금 어느 단계세요?</p></div>
    <article className={styles.userMessage} data-coach-message="user"><p>{mode}</p></article>
    {snapshot.coach.messages.map(message => placeLog(message, (() => {
      if (snapshot.intake.job?.kind === "design" && message.id === `${snapshot.intake.job.id}:reply` && snapshot.coach.design?.sourceRevision === (snapshot.coach.documentRevision ?? snapshot.coach.revision)) return null;
      // 사업 방향 요약 글(businessDesignReply)은 대화에 쌓지 않는다 — 앞 답을 고칠 때마다 한 벌씩 늘었다. 최신 방향은 아래 카드 한 곳에만 보인다.
      if (message.role === "assistant" && isDesignReplyText(message.text)) return null;
      if (replacedIndustry.has(message.id) || replacedAnswers.has(message.id)) return null;
      const answerEntry = Object.entries(snapshot.intake.answers).find(([, answer]) => answer.messageId === message.id);
      const notes = snapshot.intake.notes.filter(note => note.id.startsWith(`${message.id}:`) && /^\d+$/.test(note.id.slice(message.id.length + 1)));
      // Older message labels are display-only; edits always use the current stable question ID.
      const question = message.role === "user" && !notes.length ? snapshot.questions.find(question => answerEntry ? question.id === answerEntry[0] : message.text.startsWith(`${question.label}: `)) : undefined;
      // 목록에 없는 질문의 답(탐색 중 '직접 적을래요'로 쓴 사업 소개 등)도 저장할 때 붙인 '사업 소개: ' 머리말은 떼고 보인다 — 손님이 쓴 적 없는 말이다
      const labelled = question ?? (message.role === "user" && !notes.length && answerEntry ? getIntakeQuestion(snapshot.intake.mode, snapshot.intake.sector, answerEntry[0], snapshot.structure?.values) : undefined);
      const text = answerEntry?.[1].status === "unknown" ? "아직 정하지 않았어요" : labelled && message.text.startsWith(`${labelled.label}: `) ? message.text.slice(labelled.label.length + 2) : message.text;
      /*
       * 대화로 고치기에서 [바꾸기]로 적용한 사실(편집 요청 번호:순번)은 손님이 쓴 말이 아니다 — 질문과 내 말풍선으로 다시 쌓지 않고
       * '바꾼 내용' 한 줄로 남긴다(여정 점검 2026-10-23: 적용하면 '주로 누가 이용하나요?'와 새 답 말풍선이 생겼다).
       */
      if (message.role === "user" && appliedEdit(message.id)) return <div key={message.id} className={styles.chatTurn}>
        <p className={styles.changeNote} data-change-note>바꾼 내용 · {labelled ? `${labelled.label}: ${bubbleAnswerText(labelled, text)}` : text}</p>
      </div>;
      /* '이 장 고치기'로 보낸 말 — 저장된 머리표 '[1장 사업 개요]'는 말풍선 위 작은 꼬리표로, 말풍선에는 본문만(PC 점검 2026-10-24) */
      const sectionEdit = message.role === "user" && !labelled ? splitSectionEditMessage(text) : null;
      return <div key={message.id} className={styles.chatTurn}>
        {question && <div className={styles.assistantMessage}><ChatSpeaker /><p>{questionPromptText(question.prompt)}</p></div>}
        {sectionEdit?.tag && <p className={styles.bubbleTag}>{sectionEdit.tag}</p>}
        <article className={message.role === "user" ? styles.userMessage : styles.assistantMessage} data-coach-message={message.role}>
          {message.role === "assistant" ? <><ChatSpeaker /><ConversationText text={questionPromptText(text.replace(/(?:아래 )?"계획서 (?:다시 작성하기|에 반영하기)"/, "\"계획서에 반영하기\""))} /></> : <p>{sectionEdit ? sectionEdit.body : bubbleAnswerText(labelled, text)}</p>}
          {answerEntry && question && !readOnly && <button type="button" className={styles.messageEdit} title="이 답변 수정" aria-label={`${question.label} 답변 수정`} onClick={() => onEdit(question.id)}><PencilLine size={14} /></button>}
        </article>
        {pro && message.role === "assistant" && <MessageMeta text={text} at={message.at} />}
        {receipt && message.id === lastUserId && !notes.length ? <p className={styles.messageStatus} data-receipt>{receipt}</p>
          : message.id === industryAnswerId && replacedIndustry.size > 0 ? <p className={styles.messageStatus}>업종을 바꿨어요</p>
          : changedAnswerIds.has(message.id) && <p className={styles.messageStatus}>답을 바꿨어요</p>}
        {/* 질문으로 남긴 글은 아래 'AI 답변 받기'가 따로 안내한다 — 질문 말풍선에 '입력은 저장됨'을 붙이지 않는다 */}
        {margin?.anchor === message.id && <WorkLog items={[margin]} unit="" />}
        {notes.length > 0 && !notes.every(note => note.intent === "question") && <p className={styles.messageStatus}>{notes.some(note => note.status === "failed") ? "입력은 저장됨 · 자동 정리는 미완료" : notes.some(note => note.status === "queued" || note.status === "processing") ? "입력은 저장됨 · 자동 정리 중" : notes.some(note => note.status === "review") ? "입력은 저장됨 · 정리한 내용 확인 필요" : "입력은 저장됨"}</p>}
      </div>;
    })()))}
    {!logPlaced && log!.node}
  </div>;
}

export function AnswerHistory({ snapshot, drafts, onEdit, onKeepAsMemo, readOnly = false }: { snapshot: IntakeSnapshot; drafts: Record<string, AnswerDraft>; onEdit: (id: string) => void; onKeepAsMemo: (id: string) => void; readOnly?: boolean }) {
  const draftIds = Object.keys(drafts);
  const orphaned = draftIds.filter(id => !snapshot.questions.some(question => question.id === id) && !["business", "industry"].includes(id));
  const questions = snapshot.questions.filter(question => snapshot.intake.answers[question.id] || (question.fieldKey && snapshot.coach.fields.some(field => field.key === question.fieldKey && field.basis === "user")) || draftIds.includes(question.id));
  if (!questions.length && !orphaned.length) return null;
  return <>{orphaned.length > 0 && <section className={styles.recoveredDrafts} aria-labelledby="intake-recovered-heading"><h3 id="intake-recovered-heading">이전 질문에 입력한 내용</h3>{orphaned.map(id => <div key={id}><strong>{drafts[id].label || "이전 질문 답변"}</strong><p>{drafts[id].text || drafts[id].selected.join(", ") || "빈 답변"}</p><button type="button" className={styles.textButton} onClick={() => onKeepAsMemo(id)}>자유 메모로 가져오기</button></div>)}</section>}{questions.length > 0 && <details className={styles.history}><summary>이전 답변 <span>{questions.length}</span></summary><ul>{questions.map(question => {
    const answer = snapshot.intake.answers[question.id];
    const labelled = answer && answer.status !== "unknown" ? Array.isArray(answer.value) ? answer.value.map(item => question.options?.find(option => option.value === item)?.label ?? item).join(", ") : question.options?.find(option => option.value === answer.value)?.label ?? (summaryAnswerText(question, answer.value, snapshot.candidateIdeas) || answerText(answer.value)) : "";
    /* 업종은 고른 세부 업종(화초 및 식물 소매업)을 앞에 — 큰 분류만 보이면 다른 걸 고른 줄 안다 */
    const value = answer ? answer.status === "unknown" ? "아직 정하지 않았어요" : question.id === "industry" && snapshot.ksic ? `${snapshot.ksic.name} · ${ksicSectorLabel(snapshot.ksic.code, snapshot.intake.sector, labelled)}` : labelled : coachFieldDisplay(snapshot.coach.fields.find(field => field.key === question.fieldKey)?.value ?? "");
    return <li key={question.id}><div><strong>{question.label}</strong><p>{plainText(value) || "아직 저장하지 않은 답변"}</p>{draftIds.includes(question.id) && <small>이 기기에 입력 중인 내용이 있어요</small>}</div>{!readOnly && <button className={styles.iconButton} type="button" title={`${question.label} 수정`} aria-label={`${question.label} 수정`} onClick={() => onEdit(question.id)}><PencilLine size={17} /></button>}</li>;
  })}</ul></details>}</>;
}

export function ExtractionReview({ snapshot, disabled, onCommand }: { snapshot: IntakeSnapshot; disabled: boolean; onCommand: (command: Pick<IntakeCommand, "action" | "candidateIds" | "rejectIds" | "overwriteIds">) => void }) {
  const [approvedVersion, setApprovedVersion] = useState<string | null>(null);
  const candidates = snapshot.intake.candidates.filter(candidate => candidate.status === "pending");
  const candidate = candidates[0];
  if (!candidate) return null;
  const conflict = candidateConflict(snapshot, candidate);
  const version = JSON.stringify([candidate.id, candidate.value, conflict.current, snapshot.coach.revision]);
  const approved = approvedVersion === version;
  return <section className={styles.review} aria-labelledby="intake-review-heading">
    <ChatSpeaker />
    <h3 id="intake-review-heading">메모의 이 내용을 반영할까요?</h3>
    <p className={styles.reviewRemaining}>확인할 내용 {candidates.length}개</p>
    <div className={styles.extractionTurn} key={candidate.id} aria-live="polite" aria-atomic="true">
      <strong>{COACH_FIELD_LABELS[candidate.fieldKey]}</strong>
      <ConversationText text={plainText(candidate.value) || "표시할 수 없는 값"} />
      {conflict.requiresOverwrite && <div className={styles.overwrite}>
        <p>{conflict.changed ? "그동안 바뀐 답변이 있어요. 바꾸기 전에 확인해 주세요." : "저장한 답변과 달라요."}</p>
        <p>현재 값: {plainText(conflict.current) || "미입력"}</p>
        <label><input type="checkbox" disabled={disabled} checked={approved} onChange={event => setApprovedVersion(event.target.checked ? version : null)} />현재 값을 이 내용으로 바꾸기</label>
      </div>}
      <details className={styles.disclosure}><summary>메모 원문 보기</summary><blockquote>{plainText(candidate.quote)}</blockquote></details>
    </div>
    <div className={styles.formActions}>
      <button type="button" className={styles.secondaryButton} disabled={disabled} onClick={() => onCommand({ action: "confirm-extraction", rejectIds: [candidate.id] })}><X size={17} aria-hidden="true" />반영하지 않기</button>
      <button type="button" className={styles.primaryButton} disabled={disabled || conflict.requiresOverwrite && !approved} onClick={() => onCommand({ action: "confirm-extraction", candidateIds: [candidate.id], overwriteIds: conflict.requiresOverwrite ? [candidate.id] : [] })}><Check size={17} aria-hidden="true" />이 내용 반영</button>
    </div>
  </section>;
}

export function SavedNotes({ snapshot, disabled, onExtract }: { snapshot: IntakeSnapshot; disabled: boolean; onExtract: () => void }) {
  const labels = { queued: "정리 대기", processing: "정리 중", review: "확인 필요", stored: "보관됨", failed: "정리 실패" };
  const notes = snapshot.intake.notes;
  if (!notes.length) return <p className={styles.muted}>저장한 메모가 없습니다.</p>;
  return <section className={styles.notes} aria-labelledby="intake-notes-heading"><div className={styles.sectionHeading}><h3 id="intake-notes-heading">저장한 메모</h3>{notes.some(note => ["failed", "queued"].includes(note.status)) && <button type="button" className={styles.textButton} disabled={disabled} onClick={onExtract}>메모 정리</button>}</div><ul>{[...notes].reverse().map(note => <li key={note.id}><div className={styles.noteMeta}><span data-failed={note.status === "failed"}>{labels[note.status]}</span><time dateTime={note.at}>{new Date(note.at).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}</time></div><p>{note.text}</p>{note.status === "failed" && <small>메모 원문은 저장되어 있습니다.</small>}</li>)}</ul></section>;
}

// 요약 칸의 사업 구조 이름 — '고객·지불자'·'시장 구조' 같은 말 대신 쉬운 말로(여정 점검 2026-10-23). 저장 값과 문서 쪽 이름(STRUCTURE_LABELS)은 그대로다
const STRUCTURE_AXIS_LABEL: Record<StructureAxis, string> = { payer: "돈을 내는 고객", offering: "파는 것", delivery: "고객에게 전하는 방식", revenue: "돈 버는 방식", sides: "고객 종류", license: "신고·허가" };
const STRUCTURE_VALUE_LABEL: Partial<Record<StructureAxis, Record<string, string>>> = {
  sides: { one: "고객 한 종류", two: "파는 쪽·사는 쪽 둘 다" },
  offering: { mixed: "여러 가지 섞음" },
  delivery: { mixed: "여러 방식 섞음" },
  revenue: { mixed: "여러 방식 섞음" },
};

const JOB_TITLES: Record<"extract" | "help" | "design" | "ideas" | "edit", string> = { edit: "바꿀 내용 정리 중", extract: "저장한 메모 정리 중", design: "사업 방향 정리 중", help: "AI 답변 작성 중", ideas: "새 사업 제안 받는 중" };
const monotonicNow = () => typeof performance !== "undefined" ? performance.now() : Date.now();

/*
 * 사업 방향 정리(30~40초) 진행 화면 — 코치 채팅용. 예전엔 회색 제목이 가만히 있다가 점 세 개 말풍선 뒤에 결과가 '짠' 하고
 * 나타나 멈춘 것처럼 보였다(소유자 피드백 2026-10-09). 마지막 답을 보낸 순간부터 막대와 단계 표시를 보여 준다.
 * 막대는 서버 기준 경과 시간으로 추정한 값이라 95%에서 멈추고, 끝나면 결과 화면으로 바뀐다. 오래 걸리면 그렇다고 말한다.
 */
const DESIGN_STEPS = ["답변 모으기", "고객과 문제 연결하기", "돈 버는 구조 점검하기", "시작 범위 제안하기"];
export function DesignProgress({ snapshot, announce = false }: { snapshot: IntakeSnapshot; announce?: boolean }) {
  const job = snapshot.intake.job?.kind === "design" ? snapshot.intake.job : null;
  const active = !!job && (job.status === "queued" || job.status === "running");
  const serverElapsed = snapshot.jobClock?.elapsedMs;
  const base = active && job ? serverElapsed ?? Math.max(0, Date.now() - Date.parse(job.createdAt ?? job.updatedAt)) : 0;
  const [sync, setSync] = useState(() => ({ base, at: monotonicNow() }));
  const [, setTick] = useState(0);
  useEffect(() => { setSync({ base, at: monotonicNow() }); }, [job?.id, job?.status, serverElapsed]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const timer = window.setInterval(() => setTick(value => value + 1), 500);
    return () => window.clearInterval(timer);
  }, []);
  const timing = snapshot.jobClock ?? INTAKE_JOB_TIMING.design;
  // 서버가 작업을 받기 전(마지막 답 저장 중)에도 첫 단계부터 움직이게 시작한다
  const view = active && job ? jobProgress(job.status, sync.base + (monotonicNow() - sync.at), timing.expectedMs, timing.limitMs) : { percent: 3, elapsedSeconds: 0, slow: false };
  const current = Math.min(DESIGN_STEPS.length - 1, Math.floor(view.percent / (100 / DESIGN_STEPS.length)));
  return <div className={styles.jobChat} data-kind="design" data-design-progress>
    <ChatSpeaker status="사업 방향 정리 중" />
    <div className={styles.designProgress}>
      <div className={styles.jobProgressBar} role="progressbar" aria-label="사업 방향 정리" aria-valuemin={0} aria-valuemax={100} aria-valuenow={view.percent}><span style={{ width: `${view.percent}%` }} /></div>
      <ol className={styles.designSteps}>{DESIGN_STEPS.map((step, index) => <li key={step} data-state={index < current ? "done" : index === current ? "current" : "todo"}>{index < current ? <Check size={14} aria-hidden="true" /> : index === current ? <LoaderCircle size={14} className={styles.spinner} aria-hidden="true" /> : <span aria-hidden="true" />}{step}</li>)}</ol>
    </div>
    {announce && <span className={styles.srOnly} role="status" aria-live="polite">사업 방향 정리 중 · {DESIGN_STEPS[current]}</span>}
    <small className={styles.jobChatNote}>{view.slow ? `평소보다 오래 걸리고 있어요 · ${view.elapsedSeconds}초. 답변은 저장돼 있어요.` : "답변을 바탕으로 사업 방향을 한 장으로 정리하고 있어요. 보통 30~40초 걸려요."}</small>
  </div>;
}

/** Show server status and elapsed time without presenting an estimated completion percentage. */
export function JobProgress({ snapshot, announce = false, variant = "gauge" }: { snapshot: IntakeSnapshot; announce?: boolean; variant?: "gauge" | "chat" }) {
  const job = snapshot.intake.job;
  const active = !!job && (job.status === "queued" || job.status === "running");
  const serverElapsed = snapshot.jobClock?.elapsedMs;
  const base = active && job ? serverElapsed ?? Math.max(0, Date.now() - Date.parse(job.createdAt ?? job.updatedAt)) : 0;
  const [sync, setSync] = useState(() => ({ base, at: monotonicNow() }));
  const [, setTick] = useState(0);
  // 서버 응답이 올 때마다(2.5초 간격 확인 포함) 서버 기준 경과 시간으로 다시 맞춘다.
  useEffect(() => { setSync({ base, at: monotonicNow() }); }, [job?.id, job?.status, serverElapsed]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setTick(value => value + 1), 500);
    return () => window.clearInterval(timer);
  }, [active]);
  if (!job || !active) return null;
  const timing = snapshot.jobClock ?? INTAKE_JOB_TIMING[job.kind];
  const view = jobProgress(job.status, sync.base + (monotonicNow() - sync.at), timing.expectedMs, timing.limitMs);
  const title = job.status === "queued" ? "요청을 접수했어요" : JOB_TITLES[job.kind];
  // In the conversation the job reads like the coach replying: current step beside the name, a typing bubble,
  // and elapsed time only once it runs longer than usual.
  if (variant === "chat") return <div className={styles.jobChat} data-kind={job.kind} data-job-chat>
    <ChatSpeaker status={title} />
    <TypingBubble />
    {announce && <span className={styles.srOnly} role="status" aria-live="polite">{title}</span>}
    <small className={styles.jobChatNote}>{view.slow ? `평소보다 오래 걸리고 있어요 · ${view.elapsedSeconds}초` : job.kind === "design" ? "기본 질문이 끝나서 바로 정리를 시작했어요. 보통 30~40초 걸려요." : "답변은 저장돼 있어요. 나가도 결과는 여기 남아요."}</small>
  </div>;
  return <div className={styles.jobProgress} data-kind={job.kind}>
    <div className={styles.jobProgressTitle}><LoadingStatus note={job.status === "queued" ? "요청을 접수했어요" : JOB_TITLES[job.kind]} announce={announce} /></div>
    <div className={styles.jobProgressBar} role="progressbar" aria-label={JOB_TITLES[job.kind]} aria-valuetext={job.status === "queued" ? "처리 대기 중" : "처리 중"}><span className={styles.indeterminateProgress} /></div>
    <small className={styles.jobProgressMeta}>{view.elapsedSeconds}초 경과{view.slow ? " · 처리 상태를 확인하고 있어요" : ""}</small>
    <small className={styles.jobProgressNote}>답변은 저장돼 있어요. 다시 들어오면 작업 상태와 결과를 확인할 수 있어요.</small>
  </div>;
}

/**
 * 지금 눌러야 할 다음 단계 하나. 사업안(방향 요약) → 계획서(전체 문서) → 계획서 열기 순서로 한 번에 하나만 보인다.
 * 작업이 돌고 있으면 버튼 자리에 진행 게이지가 나온다. secondary에는 선택형 구체화 버튼을 놓는다.
 */
type RegenQuota = { allowed: number; used: number; remaining: number; unavailable?: true };

/**
 * 계획서에 다시 반영하기 전에 비용을 먼저 보여 준다 — 다시 쓸 항목 수와 남은 다시 생성 횟수.
 * 예전엔 버튼을 눌러 막힌 뒤에야(402) 횟수가 모자란 걸 알았다(사용자 피드백 2026-10).
 */
export function RewriteCost({ snapshot }: { snapshot: IntakeSnapshot }) {
  const [quota, setQuota] = useState<{ quota: RegenQuota | null; pack?: { count: number; amount: number } } | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/plan/regen-quota?planId=${encodeURIComponent(snapshot.planId)}`, { cache: "no-store" })
      .then(response => response.ok ? response.json() : null)
      .then(data => { if (alive) setQuota(data); })
      .catch(() => { /* 횟수를 모르면 항목 수만 보여 준다 */ });
    return () => { alive = false; };
  }, [snapshot.planId, snapshot.updatedAt]);
  const count = snapshot.rewriteCount;
  const known = quota?.quota && !quota.quota.unavailable ? quota.quota : null;
  const free = (snapshot.freeReflects ?? 0) > 0 && count !== 0;
  const short = !free && !!known && count !== undefined && count > known.remaining;
  // 고친 내용 반영은 계획서마다 정해진 번수까지 무료(lib/plan-builder/free-reflect.ts)
  if (free) return <p className={styles.rewriteCost} role="status">{count ? <>바뀐 내용에 맞춰 <b>{count}개 항목</b>을 다시 써요</> : "바뀐 내용과 맞지 않는 항목만 다시 써요"} · <b>무료</b>예요 (무료 {snapshot.freeReflects}번 남음)</p>;
  return <p className={styles.rewriteCost} data-short={short || undefined} role="status">
    {count === undefined ? <>바뀐 내용과 맞지 않는 항목만 다시 써요 · 항목마다 다시 생성 횟수 1회가 차감돼요{known ? <> (남은 횟수 {known.remaining}/{known.allowed}회)</> : null}</> : count > 0 ? <>바뀐 내용에 맞춰 <b>{count}개 항목</b>을 다시 써요{known ? <> · 다시 생성 횟수 <b>{count}회</b> 차감 (남은 횟수 {known.remaining}/{known.allowed}회)</> : <> · 항목마다 다시 생성 횟수 1회가 차감돼요</>}</> : "직접 고친 항목은 그대로 두고, 바뀐 내용과 맞지 않는 항목만 다시 써요."}
    {short && <> — 횟수가 {count! - known!.remaining}회 모자라요. <Link href={`/plan/pay?planId=${encodeURIComponent(snapshot.planId)}&planType=${encodeURIComponent(snapshot.planType)}&product=regen`}>{quota?.pack ? `${quota.pack.count}회 추가 (${quota.pack.amount.toLocaleString("ko-KR")}원)` : "다시 생성 횟수 추가"}</Link></>}
  </p>;
}

/**
 * 계획서를 다시 쓰는 버튼 하나. 횟수·안내는 누른 뒤 확인창에서만 보여 준다 —
 * 버튼 옆에 설명을 늘어놓으면 헷갈린다는 소유자 피드백(2026-10-07).
 */
export function RewriteConfirm({ snapshot, disabled, label = "계획서에 반영하기", className, onConfirm }: { snapshot: IntakeSnapshot; disabled: boolean; label?: string; className?: string; onConfirm: () => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);
  return <>
    <button type="button" className={className ?? styles.primaryButton} disabled={disabled} onClick={() => setOpen(true)} data-rewrite-open><FileText size={18} aria-hidden="true" />{label}</button>
    {open && createPortal(<div className={styles.confirmBackdrop} onClick={() => setOpen(false)}>
      <div className={styles.confirmBox} role="dialog" aria-modal="true" aria-labelledby="rewrite-confirm-title" data-rewrite-confirm onClick={event => event.stopPropagation()}>
        <h3 id="rewrite-confirm-title">바뀐 내용으로 다시 쓸까요?</h3>
        <RewriteCost snapshot={snapshot} />
        <p>다 쓸 때까지 지금 계획서는 그대로 남아 있어요.</p>
        <div className={styles.confirmActions}><button type="button" onClick={() => setOpen(false)}>취소</button><button type="button" autoFocus onClick={() => { setOpen(false); onConfirm(); }}>반영하기</button></div>
      </div>
    </div>, document.body)}
  </>;
}

export function NextStepAction({ snapshot, prepared, disabled, aiBusy, onDesign, onPrepare, secondary, announce = false, minimal = false, preparing = false, payNote, reflect = "button" }: {
  snapshot: IntakeSnapshot; prepared: boolean; disabled: boolean; aiBusy: boolean; onDesign: () => void; onPrepare: () => void; secondary?: ReactNode; announce?: boolean;
  /**
   * 계획서가 이미 있을 때 '계획서에 반영하기'의 모양 — 작업실 PC 는 계획서 칸(띠 · 노란 카드)에 같은 단추가 있어 대화 칸은 작은 글 링크(link),
   * 오른쪽에 계획서 칸이 보이지 않으면 두지 않는다(none). 휴대폰 · 예전 화면은 큰 단추(button) 그대로(r37 점검: 세 번 보였다)
   */
  reflect?: "button" | "link" | "none";
  /** '사업계획서 만들기' 아래 한 줄 — 결제 전이면 가격(웹), 이미 결제했으면 바로 작성. 없으면 기본 안내 */
  payNote?: string;
  /** '사업계획서 만들기'를 눌러 서버 확인·결제 화면 이동을 기다리는 중 — 단추가 그냥 흐려지기만 해 멈춘 줄 알았다(대표 지적 2026-10-16) */
  preparing?: boolean;
  /** 코치 채팅 결과 화면: 단계 표시·긴 설명 없이 버튼과 한 줄만(DesignResult 아래) */
  minimal?: boolean;
}) {
  const step = intakeNextStep(snapshot, prepared);
  if (!step) return null;
  // 게이지는 실제로 돌고 있는 작업이 있을 때만. 그 밖의 바쁜 상태(저장 중 등)에는 버튼을 잠깐 비활성으로 둔다.
  const jobActive = ["queued", "running"].includes(snapshot.intake.job?.status ?? "");
  const locked = disabled || aiBusy;
  /*
   * 두 단계를 분명히 나눈다. 1단계 결과(사업 방향 요약)가 계획서처럼 보여서
   * "이미 계획서가 나왔는데 또 만들라고?" 하는 혼동이 있었다(사용자 피드백).
   */
  const sectionCount = chaptersForType(snapshot.planType).reduce((total, chapter) => total + chapter.sections.length, 0);
  const hint = step === "design" ? "먼저 답변을 바탕으로 사업 방향을 한 장으로 요약해요. 사업계획서 문서는 다음 단계에서 만들어요."
    : step === "prepare" ? `지금까지 만든 건 사업 방향 요약이에요. 이 버튼을 누르면 이 내용으로 정식 사업계획서 문서를 작성해요. 전체는 ${sectionCount}개 항목(재무표 포함)이고, 결제한 뒤에 작성을 시작해요(결제 전이면 결제 화면으로 이동해요). 몇 분 걸리고, 다 되면 바로 열 수 있어요.`
    : "사업계획서 문서는 언제든 다시 열 수 있어요.";
  const reapply = step === "prepare" && snapshot.hasDocuments && snapshot.documentStatus === "stale";
  // 바뀐 내용은 없고 아직 안 쓴 항목만 남았으면(예전 무료 체험으로 앞 2개만 있음, 작성 중 실패) 남은 항목만 이어서 쓴다 — 다시 생성 횟수를 쓰지 않는다
  if (step === "prepare" && snapshot.hasDocuments && !reapply && snapshot.missingSections) return <div className={styles.rewriteAction} data-step={step}>{jobActive ? <JobProgress snapshot={snapshot} announce={announce} /> : <button type="button" className={styles.primaryButton} disabled={locked} onClick={onPrepare}><FileText size={18} aria-hidden="true" />남은 {snapshot.missingSections}개 항목 이어서 작성하기</button>}</div>;
  if (minimal && !jobActive && (step === "prepare" && !snapshot.hasDocuments || step === "open")) return <div className={styles.resultAction} data-step={step}>
    {step === "prepare" ? <button type="button" className={styles.primaryButton} disabled={locked || preparing} aria-busy={preparing || undefined} onClick={onPrepare}>{preparing ? <><Spinner />사업계획서 준비하고 있어요</> : <><FileText size={18} aria-hidden="true" />사업계획서 만들기</>}</button>
      : <Link className={styles.primaryButton} href={`/plan/document?planId=${encodeURIComponent(snapshot.planId)}`}><FileText size={18} aria-hidden="true" />사업계획서 열기</Link>}
    {step === "prepare" && <small className={styles.nextStepHint} role={preparing ? "status" : undefined}>{preparing ? "잠시만요. 결제 화면을 여는 중이에요." : payNote ?? "결제하면 바로 작성을 시작해요. 몇 분 걸려요."}</small>}
  </div>;
  // 계획서가 이미 있으면 단계 표시·설명·이전 계획서 링크 없이 버튼 하나만(확인창에서 안내).
  if (step === "prepare" && snapshot.hasDocuments) {
    if (reflect === "none" && !jobActive) return null;
    return <div className={styles.rewriteAction} data-step={step}>{jobActive ? <JobProgress snapshot={snapshot} announce={announce} /> : <RewriteConfirm snapshot={snapshot} disabled={locked} onConfirm={onPrepare} className={reflect === "link" ? styles.textButton : undefined} />}</div>;
  }
  return <div className={styles.nextStep} data-active data-step={step}>
    <ol className={styles.stepper} aria-label="진행 단계">
      <li data-state={step === "design" ? "current" : "done"}>{step === "design" ? <span>1</span> : <Check size={13} aria-hidden="true" />}사업 방향 요약</li>
      <li data-state={step === "prepare" ? "current" : step === "open" ? "done" : "todo"}>{step === "open" ? <Check size={13} aria-hidden="true" /> : <span>2</span>}사업계획서 문서 작성</li>
    </ol>
    {jobActive ? <JobProgress snapshot={snapshot} announce={announce} /> : <div className={styles.nextStepRow}>
      {step === "design" && <button type="button" className={styles.primaryButton} disabled={locked} onClick={onDesign}>사업 방향 정리하기</button>}
      {step === "prepare" && <button type="button" className={styles.primaryButton} disabled={locked || preparing} aria-busy={preparing || undefined} onClick={onPrepare}>{preparing ? <><Spinner />사업계획서 준비하고 있어요</> : <><FileText size={18} aria-hidden="true" />{snapshot.documentStatus === "stale" ? "계획서에 반영하기" : "사업계획서 문서 작성하기"}</>}</button>}
      {step === "open" && <Link className={styles.primaryButton} href={`/plan/document?planId=${encodeURIComponent(snapshot.planId)}`}><FileText size={18} aria-hidden="true" />사업계획서 문서 열기</Link>}
      {secondary}
    </div>}
    {!jobActive && reapply && <RewriteCost snapshot={snapshot} />}
    {!jobActive && <small className={styles.nextStepHint}>{reapply ? "대화는 무료예요. 계획서에 반영할 때만 다시 생성 횟수가 차감되고, 반영하기 전까지 기존 계획서는 그대로예요." : snapshot.hasDocuments ? `${hint} 대화로 내용을 더 다듬는 건 무료예요. 계획서에 반영할 때만 다시 생성 횟수가 차감돼요.` : hint}</small>}
  </div>;
}

/** 현재 입력 기준으로 만든 설계의 첫 화면 문구. 입력이 바뀌어 설계가 낡았거나 옛 설계면 없다 */
export function currentIdentity(snapshot: IntakeSnapshot) {
  const design = snapshot.coach.design;
  return design && design.sourceRevision === (snapshot.coach.documentRevision ?? snapshot.coach.revision) ? design.identity : undefined;
}

/*
 * '아, 이 사업!' — 설계가 끝나면 무슨 사업인지 한 줄로 크게 보여 주고 이름 후보를 고르게 한다.
 * 예전에는 처음 적은 문장이 그대로 사업명이 되고 제안 본문만 이어져서, 결과가 좋아도 "이게 뭐지" 싶었다.
 * 이름을 고르면 사업 이름만 바뀌고(정리한 방향·계획서는 그대로) 이후 만드는 계획서에 그 이름이 들어간다.
 */
export function BusinessIdentityHero({ snapshot, disabled, onName, compact = false }: { snapshot: IntakeSnapshot; disabled?: boolean; onName?: (name: string) => void; compact?: boolean }) {
  const identity = currentIdentity(snapshot);
  const [custom, setCustom] = useState<string | null>(null);
  if (!identity) return null;
  const current = snapshot.coach.business.name;
  const submitCustom = (event: FormEvent) => { event.preventDefault(); const name = (custom ?? "").replace(/\s+/g, " ").trim(); if (name && onName) { onName(name); setCustom(null); } };
  return <section className={`${styles.identity} ${compact ? styles.identityCompact : ""}`} aria-label="사업 한 줄 정리">
    <p className={styles.identityKicker}>사업 방향 <small>AI 초안</small></p>
    <h2 className={styles.identityHeadline}>{identity.headline}</h2>
    <p className={styles.identityPitch}>{identity.pitch}</p>
    {!compact && onName && <div className={styles.identityNames}>
      <h3>사업 이름은 이건 어때요?</h3>
      <div className={styles.identityChoices}>
        {identity.names.map(item => {
          const chosen = item.name === current;
          return <button key={item.name} type="button" aria-pressed={chosen} disabled={disabled || chosen} onClick={() => onName(item.name)}>
            <strong>{chosen && <Check size={15} aria-hidden="true" />}{item.name}</strong><small>{item.why}</small>
          </button>;
        })}
      </div>
      {custom === null
        ? <button type="button" className={styles.textButton} disabled={disabled} onClick={() => setCustom(identity.names.some(item => item.name === current) ? "" : current)}><PencilLine size={15} aria-hidden="true" />직접 정하기</button>
        : <form className={styles.identityCustom} onSubmit={submitCustom}>
            <input aria-label="사업 이름 직접 입력" maxLength={40} value={custom} autoFocus onChange={event => setCustom(event.target.value)} placeholder="예: 새벽커피" />
            <button type="submit" className={styles.secondaryButton} disabled={disabled || !custom.trim()}>이 이름으로</button>
            <button type="button" className={styles.textButton} onClick={() => setCustom(null)}>취소</button>
          </form>}
      <small className={styles.identityNote}>지금 이름: <b>{current}</b> · 고른 이름은 앞으로 만드는 계획서에 들어가요. 실제로 쓰기 전에 키프리스(kipris.or.kr)에서 같은 상표가 있는지 확인해 주세요.</small>
    </div>}
  </section>;
}

/*
 * 코치 채팅의 1단계 결과 — 사업 이름 추천과 직접 수정하기, 사업 방향 요약만 둔다. 그 아래 '사업계획서 만들기'(결제로 이어짐) 하나.
 * 예전엔 'AI 제안' 아이콘, 이름마다 붙은 이유, 상표 안내, 제안 이유 펼치기까지 붙어 읽기 어려웠다(소유자 피드백 2026-10-09).
 * 자세한 제안 이유·확인할 내용은 요약 패널(DesignDirection)에 그대로 남아 있다.
 */
export function DesignResult({ snapshot, disabled, onName }: { snapshot: IntakeSnapshot; disabled?: boolean; onName?: (name: string) => void }) {
  const identity = currentIdentity(snapshot);
  const [custom, setCustom] = useState<string | null>(null);
  // 운영 중인 사업은 이미 이름이 있다 — 새 이름을 앞세우지 않고, 원하면 펼쳐서 본다
  const operating = snapshot.intake.mode === "operating";
  const [showNames, setShowNames] = useState(!operating);
  const design = snapshot.coach.design;
  if (!identity || !design) return null;
  const current = snapshot.coach.business.name;
  // 추천 이름을 눌렀다가도 처음 이름으로 돌아갈 수 있게 칩으로 남긴다(이름 바꾸기는 40자까지)
  const original = snapshot.intake.originalName && snapshot.intake.originalName !== current && snapshot.intake.originalName.length <= 40 ? snapshot.intake.originalName : null;
  const submitCustom = (event: FormEvent) => { event.preventDefault(); const name = (custom ?? "").replace(/\s+/g, " ").trim(); if (name && onName) { onName(name); setCustom(null); } };
  /*
   * 운영 중인 가게는 AI 이름 추천보다 지금 쓰는 가게 이름이 먼저다 — 칸을 바로 보여 주고 고치면 저장한다(여정 점검 2026-10-22).
   * 추천 이름은 '새 이름 추천 보기'로만 펼친다.
   */
  const shopName = (custom ?? current).replace(/\s+/g, " ").trim();
  if (operating) return <section className={styles.result} aria-label="결과">
    <div className={styles.resultBlock}>
      <p className={styles.resultLabel}>지금 가게 이름</p>
      {onName ? <form className={styles.identityCustom} onSubmit={event => { event.preventDefault(); if (shopName && shopName !== current) { onName(shopName); setCustom(null); } }}>
          <input aria-label="지금 가게 이름" maxLength={40} value={custom ?? current} onChange={event => setCustom(event.target.value)} placeholder="간판에 적힌 이름 (예: 망원 아침빵집)" />
          <button type="submit" className={styles.secondaryButton} disabled={disabled || !shopName || shopName === current}>이 이름으로</button>
        </form> : <h2 className={styles.resultName}>{businessDisplayName(current)}</h2>}
      <small className={styles.identityNote}>계획서와 홈페이지에 이 이름이 들어가요.</small>
      {onName && <div className={styles.resultNames} role="group" aria-label="추천 이름">
        {showNames ? identity.names.filter(item => item.name !== current).map(item => <button key={item.name} type="button" className={styles.chip} disabled={disabled} onClick={() => { setCustom(null); onName(item.name); }}>{item.name}</button>)
          : <button type="button" className={styles.chip} disabled={disabled} onClick={() => setShowNames(true)}>새 이름 추천 보기</button>}
      </div>}
    </div>
    <div className={styles.resultBlock}>
      <p className={styles.resultLabel}>결과 요약</p>
      <p className={styles.resultHeadline}>{identity.headline}</p>
      <dl className={styles.resultSummary}>
        <div><dt>이렇게 바꿔 봐요</dt><dd><ConversationText text={design.startingPlan.scope} /></dd></div>
        <div><dt>먼저 해볼 일</dt><dd><ConversationText text={design.nextAction.action} /></dd></div>
      </dl>
    </div>
  </section>;
  return <section className={styles.result} aria-label="결과">
    <div className={styles.resultBlock}>
      <p className={styles.resultLabel}>사업 이름</p>
      <h2 className={styles.resultName}>{businessDisplayName(current)}</h2>
      {onName && (custom === null
        ? <div className={styles.resultNames} role="group" aria-label="추천 이름">
            {original && <button type="button" className={styles.chip} disabled={disabled} onClick={() => onName(original)}>{original} <small className={styles.chipNote}>처음 이름</small></button>}
            {showNames ? identity.names.filter(item => item.name !== current && item.name !== original).map(item => <button key={item.name} type="button" className={styles.chip} disabled={disabled} onClick={() => onName(item.name)}>{item.name}</button>)
              : <button type="button" className={styles.chip} disabled={disabled} onClick={() => setShowNames(true)}>새 이름 추천 보기</button>}
            <button type="button" className={styles.chip} disabled={disabled} onClick={() => setCustom(identity.names.some(item => item.name === current) ? "" : current)}>직접 수정하기</button>
          </div>
        : <form className={styles.identityCustom} onSubmit={submitCustom}>
            <input aria-label="사업 이름 직접 입력" maxLength={40} value={custom} autoFocus onChange={event => setCustom(event.target.value)} placeholder="예: 새벽반찬" />
            <button type="submit" className={styles.secondaryButton} disabled={disabled || !custom.trim()}>이 이름으로</button>
            <button type="button" className={styles.textButton} onClick={() => setCustom(null)}>취소</button>
          </form>)}
    </div>
    <div className={styles.resultBlock}>
      <p className={styles.resultLabel}>결과 요약</p>
      <p className={styles.resultHeadline}>{identity.headline}</p>
      <dl className={styles.resultSummary}>
        <div><dt>{operating ? "이렇게 바꿔 봐요" : "이렇게 시작해요"}</dt><dd><ConversationText text={design.startingPlan.scope} /></dd></div>
        <div><dt>먼저 해볼 일</dt><dd><ConversationText text={design.nextAction.action} /></dd></div>
      </dl>
    </div>
  </section>;
}

/** `continued`: 바로 위에 사업 방향 카드(BusinessIdentityHero)가 있으면 같은 '사업 방향 요약' 머리말을 한 번 더 달지 않는다. */
export function DesignDirection({ snapshot, continued = false }: { snapshot: IntakeSnapshot; continued?: boolean }) {
  const design = snapshot.coach.design;
  if (!design || design.sourceRevision !== (snapshot.coach.documentRevision ?? snapshot.coach.revision)) return null;
  return <section className={styles.direction} aria-label="정리한 사업 방향">
    {!continued && <p className={styles.eyebrow}>사업 방향 요약</p>}
    <h3>{continued ? "이렇게 시작해요" : "이렇게 시작해 볼까요?"}</h3>
    <ConversationText text={design.startingPlan.scope} />
    <div className={styles.nextAction}><h3>먼저 해볼 일 하나 <small>선택 사항</small></h3><ConversationText text={design.nextAction.action} /></div>
    <details className={styles.disclosure}><summary>제안 이유와 실행 예시 보기</summary>
      <h4>제안 이유</h4><p>{design.startingPlan.whyThis}</p><p>{design.startingPlan.connectionToVision}</p>
      <h4>바로 쓸 문구</h4><p>{design.nextAction.usableText}</p><h4>완료 기준</h4><p>{design.nextAction.doneWhen}</p>
      {design.startingPlan.notIncluded.length > 0 && <><h4>이번에 포함하지 않은 것</h4><ul>{design.startingPlan.notIncluded.map((text, index) => <li key={index}>{text}</li>)}</ul></>}
      {design.assumptions.length > 0 && <><h4>아직 확인할 내용</h4><ul>{design.assumptions.map((item, index) => <li key={index}>{item.statement}<p>{item.howToCheck}</p></li>)}</ul></>}
    </details>
    {/* AI 결과 표시(인공지능기본법) — 제목 괄호 대신 맨 아래 한 줄로(대표 요청 2026-10-15: 'AI 제안, 검증 전' 꼬리표가 AI 같고 어색하다) */}
    <p className={styles.aiNote}>AI가 만든 초안이에요. 내 상황과 다르면 위의 내 답(연필)을 눌러 고쳐 주세요.</p>
  </section>;
}

export function BusinessSummary({ snapshot, disabled, aiBusy, prepared, onEdit, onDetails, onDesign, onPrepare, onStructure, showActions = true, readOnly = false }: {
  snapshot: IntakeSnapshot; disabled: boolean; aiBusy: boolean; prepared: boolean;
  onEdit: (questionId: string) => void; onDetails: () => void; onDesign: () => void; onPrepare: () => void; readOnly?: boolean;
  onStructure?: (patch: Partial<Pick<BusinessStructure, StructureAxis>>) => void;
  /** false면 다음 단계 버튼·상세 질문 버튼을 요약에 두지 않는다(대화 쪽이 이미 보여 주는 경우). */
  showActions?: boolean;
}) {
  const [structureEdit, setStructureEdit] = useState<StructureAxis | null>(null);
  const original = plainText(answerText(snapshot.intake.answers.business?.value ?? null)) || plainText(snapshot.coach.ideaOrigin?.text) || plainText(snapshot.coach.fields.find(field => field.key === "business" && field.basis === "user")?.value);
  const design = snapshot.coach.design;
  const staleDesign = !!design && design.sourceRevision !== (snapshot.coach.documentRevision ?? snapshot.coach.revision);
  const extraAnswers = snapshot.questions.filter(question => !snapshot.summary.some(item => item.id === (question.fieldKey ?? question.id)) && snapshot.intake.answers[question.id]);
  // 다음 단계: 기본 질문 완료 → 사업안 만들기 → (사업안이 현재 입력 기준이면) 계획서 만들기 → 결과물 열기
  const nextStep = intakeNextStep(snapshot, prepared);
  // 다음 단계 버튼은 화면에 한 곳에만 둔다. 대화의 마지막 정리 화면이 보여 주고 있으면(showActions=false) 요약에는 두지 않는다.
  const actions = showActions ? <div className={styles.summaryActions}>
      <NextStepAction snapshot={snapshot} prepared={prepared} disabled={disabled} aiBusy={aiBusy} onDesign={onDesign} onPrepare={onPrepare} />
      {prepared && <p role="status" className={styles.success}>계획서 작성을 시작했어요.</p>}
    </div> : null;
  const highlights = snapshot.summary.filter(item => ["customer", "offer", "budget"].includes(item.id) && item.basis !== "unknown" && plainText(item.value));
  const remaining = snapshot.summary.filter(item => !highlights.includes(item));
  const renderField = (item: IntakeSnapshot["summary"][number]) => {
    const question = snapshot.questions.find(question => question.id === item.id || question.fieldKey === item.id);
    const editableId = question?.id ?? (["business", "industry"].includes(item.id) ? item.id : null);
    const shown = plainText(item.value);
    const display = shown && question ? summaryAnswerText(question, item.basis === "unknown" ? null : shown, snapshot.candidateIdeas) || shown : shown;
    const ksic = item.id === "industry" && snapshot.ksic ? snapshot.ksic : null;
    // 업종 줄은 고른 세부 업종을 크게, 큰 분류와 코드는 아래 작은 줄로
    // 분류 코드는 보이지 않는다(손님에게 뜻 없는 숫자) — 큰 분류 이름만 작은 줄로
    const ksicLine = ksic && (display || shown) && (display || shown) !== ksic.name ? ksicSectorLabel(ksic.code, snapshot.intake.sector, display || shown) : null;
    const main = ksic ? ksic.name : display;
    return <div key={item.id}><dt><span>{item.label}</span>{item.basis === "proposal" || item.basis === "unknown" ? <small data-basis={item.basis}>{item.basis === "proposal" ? "AI 초안" : "아직 안 정함"}</small> : null}{editableId && !readOnly && <button type="button" className={styles.iconButton} aria-label={`${item.label} 수정`} title={`${item.label} 수정`} onClick={() => onEdit(editableId)}><PencilLine size={15} /></button>}</dt><dd><ConversationText text={main || "아직 정하지 않았어요"} />{ksicLine && <small className={styles.ksicNote}>{ksicLine}</small>}</dd></div>;
  };
  return <>
    <div className={styles.summaryHeading}><h2 id="intake-summary-heading">사업 요약</h2><p>{snapshot.coreComplete ? "기본 질문 입력 완료" : `기본 질문 ${snapshot.coreAnswered} / ${snapshot.coreTotal}`}</p></div>
    {snapshot.financialWarning && <div className={styles.financialWarning} role="note">
      <p>{snapshot.financialWarning.message}</p>
      {!readOnly && <div>{snapshot.financialWarning.fields.map(key => { const id = key === "price" ? "price" : key === "unitCost" ? "structure.unitCost" : "structure.cost"; const label = key === "price" ? "가격 다시 입력" : key === "unitCost" ? "변동비 다시 입력" : "고정비 다시 입력"; return <button key={key} type="button" className={styles.presetChip} disabled={disabled} onClick={() => { if (id.startsWith("structure.") && !snapshot.intake.detailsRequested) onDetails(); else onEdit(id); }}><PencilLine size={14} aria-hidden="true" />{label}</button>; })}</div>}
    </div>}
    {nextStep && actions}
    <BusinessIdentityHero snapshot={snapshot} compact />
    {original && <section className={styles.original}><h3>처음 적은 설명</h3><ConversationText text={original} /></section>}
    {highlights.length > 0 && <dl className={styles.summaryFields}>{highlights.map(renderField)}</dl>}
    {(remaining.length > 0 || extraAnswers.length > 0) && <details className={styles.summaryDetails} open><summary>다른 답변 보기 ·{remaining.length + extraAnswers.length}개</summary><dl className={styles.summaryFields}>{remaining.map(renderField)}{extraAnswers.map(question => <div key={question.id}><dt><span>{question.label}</span>{!readOnly && <button type="button" className={styles.iconButton} aria-label={`${question.label} 수정`} title={`${question.label} 수정`} onClick={() => onEdit(question.id)}><PencilLine size={15} /></button>}</dt><dd><ConversationText text={snapshot.intake.answers[question.id].status === "unknown" ? "아직 정하지 않았어요" : plainText(summaryAnswerText(question, snapshot.intake.answers[question.id].value, snapshot.candidateIdeas)) || plainText(answerText(snapshot.intake.answers[question.id].value)) || "아직 정하지 않았어요"} /></dd></div>)}</dl></details>}
    {!snapshot.summary.length && !extraAnswers.length && <p className={styles.muted}>아직 저장한 답변이 없습니다.</p>}
    {snapshot.structure && <details className={`${styles.structure} ${styles.summaryDetails}`}>
      <summary>고객·제공 방식 바꾸기</summary>
      <p className={styles.muted}>고르신 업종으로 짐작한 내용이에요. 직접 고른 내용은 따로 표시했어요.</p>
      {snapshot.structure.fallback === "unclassified" && <p className={styles.muted}>업종을 아직 정하지 않아 넓게 잡혀 있어요. 아래 항목을 직접 고르면 질문과 계산이 그대로 따라가요.</p>}
      {snapshot.structure.fallback === "compound" && <p className={styles.muted}>여러 업종이 섞인 사업으로 보여요. 매출이 가장 큰 업종을 기준으로 두고, 섞인 항목은 '여러 … 섞음'을 골라 주세요.</p>}
      <dl className={styles.summaryFields}>{STRUCTURE_AXES.map(axis => {
        const value = snapshot.structure!.values[axis] as string;
        const labels = { ...STRUCTURE_LABELS[axis] as Record<string, string>, ...STRUCTURE_VALUE_LABEL[axis] };
        const basis = snapshot.structure!.basis[axis];
        const open = structureEdit === axis;
        return <div key={axis}><dt><span>{STRUCTURE_AXIS_LABEL[axis]}</span><small>{basis === "user" ? "직접 선택" : "업종 기준"}</small>{onStructure && !readOnly && <button type="button" className={styles.iconButton} aria-label={`${STRUCTURE_AXIS_LABEL[axis]} 수정`} title={`${STRUCTURE_AXIS_LABEL[axis]} 수정`} aria-expanded={open} disabled={disabled} onClick={() => setStructureEdit(open ? null : axis)}><PencilLine size={15} /></button>}</dt>
          <dd>{labels[value] ?? value}{open && onStructure && <div className={styles.structureChips} role="group" aria-label={`${STRUCTURE_AXIS_LABEL[axis]} 선택`}>{Object.entries(labels).map(([key, label]) => <button key={key} type="button" className={styles.presetChip} data-selected={key === value || undefined} disabled={disabled} onClick={() => { setStructureEdit(null); if (key !== value) onStructure({ [axis]: key } as Partial<Pick<BusinessStructure, StructureAxis>>); }}>{label}</button>)}</div>}</dd></div>;
      })}</dl>
      {snapshot.structure.licenseHint && <p className={styles.muted}>{snapshot.structure.licenseHint}</p>}
    </details>}
    <details className={`${styles.financial} ${styles.summaryDetails}`}><summary>금액과 운영 수치 보기</summary><p>{readableFinancialSummary(snapshot)}</p></details>
    {/*
      상세 질문(수익 방식·업종별 수치) — 예전엔 여는 단추가 없어 아무도 답할 수 없었다.
      기본 질문을 마친 뒤 원하는 사람만. 답하면 손익 계산의 변동비·고정비가 정확해진다.
    */}
    {snapshot.coreComplete && !snapshot.intake.detailsRequested && <div className={styles.nextStepHint}>
      <button type="button" className={styles.presetChip} disabled={disabled} onClick={onDetails}><PencilLine size={14} aria-hidden="true" />더 자세히 답하기 (선택)</button>
      <small> 업종에 맞는 비용·매출 질문 몇 개로 손익 계산을 더 정확하게 해요.</small>
    </div>}
    {design && <details className={styles.design}><summary>AI 사업안{staleDesign ? " · 이전 입력 기준" : " · 제안"}</summary><h3>시작할 범위</h3><p>{design.startingPlan.scope}</p><p>{design.startingPlan.connectionToVision}</p><h3>제안 이유</h3><p>{design.startingPlan.whyThis}</p><h3>확인할 가정</h3><ul>{design.assumptions.map((assumption, index) => <li key={index}>{assumption.statement}<p>{assumption.howToCheck}</p></li>)}</ul></details>}
    {showActions && !nextStep && <small className={styles.nextStepHint}>{snapshot.coreComplete ? "사업 소개를 정하면 사업 방향을 정리할 수 있어요." : "기본 질문을 마치면 사업 방향을 정리할 수 있어요."}</small>}
    {(snapshot.hasDocuments || prepared) && <nav className={styles.artifactLinks} aria-label="저장한 결과물">{showActions || nextStep !== "open" ? <Link href={`/plan/document?planId=${encodeURIComponent(snapshot.planId)}`}><FileText size={17} aria-hidden="true" />계획서 열기<ChevronRight size={16} aria-hidden="true" /></Link> : null}<Link href={`/plan/workspace?planId=${encodeURIComponent(snapshot.planId)}`}>내 사업<ChevronRight size={16} aria-hidden="true" /></Link></nav>}
  </>;
}
