"use client";
import { FREE_SECTION_COUNT } from "../../../../lib/plan-builder/free-tier";
import { ResourceFitDetails } from "./ResourcePanel";
import { INTAKE_JOB_TIMING } from "../../../../lib/plan-builder/intake-timing";
import { chaptersForType } from "../../../../lib/plan-builder/blueprint";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { LoadingStatus } from "../../PlanLoading";
import { ArrowRight, Check, CheckCircle2, ChevronRight, FileText, Lightbulb, ListFilter, LoaderCircle, PencilLine, Plus, Sparkles, Store, X } from "lucide-react";
import type { IntakeCommand, IntakeSnapshot, IntakeValue } from "../../../../lib/plan-builder/intake-types";
import { type IntakeMode, type IntakeQuestion } from "../../../../lib/plan-builder/intake-questions";
import { COACH_FIELD_LABELS, coachFieldDisplay } from "../../../../lib/plan-builder/coach-presentation";
import { amountRanges, CHIP_GROUPS, COST_RATIO_PRESETS, suggestPriceFromCost, formatWon, numberAnswer, numberPresetLabel, numberPresets, openEndPresets, periodMonths, scaledAmountRanges, stepFor, wonAnswer, wonLabel, type AmountRange } from "../../../../lib/plan-builder/intake-options";
import { answerText, assembleHybridText, candidateConflict, chipLimit, groupTitle, intakeChipSector, isFilterGroup, isHybridQuestion, isPrefillQuestion, metricNeedsCount, optionGroups, PERIOD_PRESETS, periodDates, periodPresetRange, plainText, readableFinancialSummary, selectedCount, stepVisible, suggestedIntakeIndustry, summaryAnswerText, toggleChip, unmatchedPieces, withCount, type AnswerDraft, jobProgress, intakeNextStep } from "./model";
import { mentionedAnswer, undecidedHelp } from "./guidance";
import { CoachWelcome } from "../../../../components/coach-chat-ui";
import { STRUCTURE_AXES, STRUCTURE_LABELS, type BusinessStructure, type StructureAxis } from "../../../../lib/plan-builder/business-structure";
import styles from "../intake.module.css";
import { chatTextPreview } from "./model";
import type { QuestionSuggestions } from "./AnswerSuggestions";

export function EntryChoices({ disabled, onStart, initialMessage }: { disabled: boolean; onStart: (mode: IntakeMode) => void; initialMessage?: string | null }) {
  const choices = [
    { mode: "exploring" as const, label: "아이디어를 찾고 있어요", Icon: Lightbulb },
    { mode: "startup" as const, label: "생각한 사업이 있어요", Icon: FileText },
    { mode: "operating" as const, label: "사업을 운영 중이에요", Icon: Store },
  ];
  return <section className={styles.entry} aria-labelledby="intake-entry-heading">
    <div id="intake-entry-heading"><CoachWelcome tagline={false} /></div>
    {initialMessage && <div className={styles.introMessage}><article className={styles.userMessage} data-coach-message="user"><p>{initialMessage}</p></article><p className={styles.messageStatus}>이 기기에 보관 중</p><div className={styles.assistantMessage}><ChatSpeaker /><p>지금 어느 단계에 계신가요?<br />이 이야기부터 이어갈게요</p></div></div>}
    <div className={styles.entryChoices} aria-label="대화 시작 선택지">{choices.map(({ mode, label, Icon }) => <button type="button" key={mode} disabled={disabled} onClick={() => onStart(mode)}><Icon size={23} aria-hidden="true" /><span>{label}</span><ChevronRight size={20} aria-hidden="true" /></button>)}</div>
    <Link className={styles.textLink} href="/plan">저장한 사업 불러오기</Link>
  </section>;
}

export function QuestionForm({ question, snapshot, draft, editing, disabled, onChange, onAnswer, onCancel, inChat = false, refining = false, suggestions }: {
  question: IntakeQuestion; snapshot: IntakeSnapshot; draft: AnswerDraft; editing: boolean; disabled: boolean;
  onChange: (value: AnswerDraft) => void; onAnswer: (value: IntakeValue, unknown?: boolean, questionId?: string, extra?: { ksic?: string }) => void;
  onCancel: () => void; inChat?: boolean; refining?: boolean;
  /** 첫 사업 설명에 맞춘 AI 추천(시험 기능). 누르면 입력칸에 들어가고, 보내기 전까지는 답변이 아니다. */
  suggestions?: QuestionSuggestions;
}) {
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
  const [ksicQuery, setKsicQuery] = useState("");
  const [ksicResults, setKsicResults] = useState<IntakeSnapshot["ksicCandidates"]>([]);
  useEffect(() => {
    const query = ksicQuery.trim();
    if (!inChat || question.id !== "industry" || query.length < 2) { setKsicResults([]); return; }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/plan/chat?ksic=${encodeURIComponent(query)}`, { headers: { "x-business-intake": "2" }, cache: "no-store", signal: controller.signal })
        .then(response => response.ok ? response.json() : null)
        .then(data => { if (!controller.signal.aborted) setKsicResults(Array.isArray(data?.ksicCandidates) ? data.ksicCandidates : []); })
        .catch(() => { if (!controller.signal.aborted) setKsicResults([]); });
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [ksicQuery, inChat, question.id]);
  const ksicShown = ksicQuery.trim().length >= 2 ? ksicResults : ksicCandidates;
  const candidate = question.id === "candidate";
  const options = candidate ? snapshot.candidateIdeas.map(idea => ({ value: idea.id, label: idea.title })) : question.options ?? [];
  const stage = (value: IntakeValue) => onChange({ ...draft, text: String(value ?? ""), unknown: false });
  const commit = (value: IntakeValue) => { if (!disabled) { if (inChat) stage(value); else onAnswer(value, false, question.id); } };
  const choose = (value: string) => {
    const selected = question.kind === "multi" ? toggleChip(question, draft.selected, value) : [value];
    onChange({ ...draft, custom: false, selected, unknown: false, ksic: undefined });
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
  const revealed = (index: number) => stepVisible(question, groups, index, draft.selected);
  // A text amount question (food_beverage.averageTicket) keeps kind text but offers the ladder; picks land in draft.text with an (예상)/(실제 기록) tag.
  const sector = intakeChipSector(snapshot);
  const ticketRanges = question.kind === "text" && question.unit === "원" && !question.options?.length ? amountRanges(sector, question.id, snapshot.intake.mode) : [];
  const ticket = ticketRanges.length > 0;
  // Space price picks a basis (시간당 · 1박 · 월 멤버십) before its ladder; sales scales the monthly ladder by the reporting period.
  const basisOptions = numeric && question.options?.length ? options : [];
  const basis = basisOptions.find(option => draft.selected.includes(option.value))?.label;
  const months = question.id === "sales" ? periodMonths(answerText(snapshot.intake.answers.period?.value ?? null)) : null;
  const ladder = numeric && question.unit === "원" && (!basisOptions.length || basis) ? amountRanges(sector, question.id, snapshot.intake.mode, basis) : [];
  const ranges = months && months > 1 ? scaledAmountRanges(ladder, months) : ladder;
  return <section className={`${styles.question} ${inChat ? styles.chatQuestion : ""}`} aria-labelledby="intake-question-heading" data-chat-question={inChat || undefined}>
    {inChat && <ChatSpeaker />}
    {(!inChat || editing) && <div className={styles.questionMeta}>
      <span>{refining ? "선택 보완" : editing ? "답변 수정" : inChat ? "" : snapshot.coreComplete ? "선택 보완" : "기본 질문"}</span>
      {editing && <button type="button" className={styles.textButton} onClick={onCancel}>{snapshot.coreComplete ? "마무리로 돌아가기" : "현재 질문으로"}</button>}
    </div>}
    <h2 id="intake-question-heading" tabIndex={-1}>{showMention ? `${question.label}, 앞서 말한 내용으로 이어갈까요?` : showSuggested ? "이 업종으로 정리할까요?" : question.prompt}</h2>
    {question.hint && !showSuggested && !showMention && <p className={styles.questionHint}>{question.hint}</p>}
    {draft.hint && <p className={styles.draftHint}>이전 답변: {draft.hint}</p>}
    <form onSubmit={submit}>
      {showMention && <div className={styles.mention} aria-label="이전 대화에서 찾은 답변">
        <blockquote>{mention.quote}</blockquote>
        <p>답변으로 쓸 내용: <strong>{mention.value}</strong></p>
        <div className={styles.suggestionActions}>
          <button type="button" className={styles.primaryButton} disabled={disabled} onClick={() => onChange({ ...draft, text: mention.value, selected: [], unknown: false, dismissedMention: mention.key })}>이 내용 선택<Check size={17} aria-hidden="true" /></button>
          <button type="button" className={styles.textButton} disabled={disabled} onClick={() => onChange({ ...draft, dismissedMention: mention.key })}>다르게 답하기</button>
        </div>
      </div>}
      <div hidden={showMention}>
      {inChat && question.id === "industry" && !manualIndustry && <div className={styles.ksicCandidates} role="group" aria-label="표준산업분류 후보">
        <label className={styles.ksicSearch}><span className={styles.srOnly}>업종 이름으로 찾기</span><input type="search" value={ksicQuery} placeholder="업종 이름으로 찾기 (예: 네일, 반찬, 학원)" maxLength={80} disabled={disabled} onChange={event => setKsicQuery(event.target.value)} /></label>
        {ksicShown.length > 0 && <p className={styles.ksicLead}>{snapshot.structure?.fallback === "compound" ? "여러 업종이 섞여 있어요. 가장 가까운 업종을 먼저 정할까요?" : "이야기해 주신 내용과 가까운 업종이에요."}</p>}
        {ksicQuery.trim().length >= 2 && ksicShown.length === 0 && <p className={styles.ksicLead}>맞는 업종이 없으면 아래 11개 중에서 골라도 됩니다.</p>}
        <div className={styles.ksicChips}>{ksicShown.map(item => <button key={item.code} type="button" className={styles.ksicChip} aria-pressed={draft.ksic === item.code} disabled={disabled} onClick={() => onChange({ ...draft, custom: false, selected: [item.sector], unknown: false, ksic: item.code, ksicName: item.name })}><strong>{item.name}</strong><span>{item.path.split(" › ").slice(0, 2).map(part => part.replace(/;.*$/, "")).join(" › ")}</span></button>)}</div>
      </div>}
      {showSuggested && <div className={styles.industrySuggestion} role="group" aria-label="추천 업종">
        <p className={styles.suggestionReason}>입력하신 사업 내용을 보면 이 업종에 가까워 보여요. 맞는지 확인해 주세요.</p>
        <div className={styles.suggestedIndustry}><CheckCircle2 size={23} aria-hidden="true" /><strong>{suggested.label}</strong></div>
        <div className={styles.suggestionActions}>
          <button className={styles.primaryButton} type="button" disabled={disabled} aria-pressed={draft.selected.includes(suggested.value)} onClick={() => onChange({ ...draft, custom: false, selected: [suggested.value], unknown: false, ksic: undefined })}>이 업종 선택<Check size={17} aria-hidden="true" /></button>
          <button className={styles.textButton} type="button" disabled={disabled} aria-expanded="false" aria-controls="intake-industry-options" onClick={() => setManualIndustry(true)}><ListFilter size={16} aria-hidden="true" />직접 선택하기</button>
        </div>
      </div>}
      {suggested && manualIndustry && <button type="button" className={styles.textButton} disabled={disabled} onClick={() => setManualIndustry(false)}>추천 업종 보기</button>}
      {choice && !showSuggested && groups.map((group, index) => revealed(index) && <fieldset key={group.name ?? index} id={question.id === "industry" ? "intake-industry-options" : undefined} className={styles.options} data-step={groups.length > 1 ? index + 1 : undefined}>
        <legend className={groups.length > 1 && group.name ? styles.stepLegend : styles.srOnly}>{groups.length > 1 && group.name ? groupTitle(group.name) : question.label}</legend>
        {group.options.map(option => {
          const idea = candidate ? snapshot.candidateIdeas.find(item => item.id === option.value) : undefined;
          return <div key={option.value} className={idea ? styles.ideaOption : undefined} data-selected={draft.selected.includes(option.value)}><label className={styles.option} data-selected={draft.selected.includes(option.value)}>
            <input type={question.kind === "multi" ? "checkbox" : "radio"} name={`intake-${question.id}`} value={option.value} checked={draft.selected.includes(option.value)} disabled={inChat && disabled} onChange={() => choose(option.value)} />
            <span><strong>{option.label}</strong>{option.hint && <small className={styles.optionHint}>{option.hint}</small>}{idea && <><span className={styles.optionDescription}>{chatTextPreview(idea.description) ?? idea.description}</span><ResourceFitDetails fit={idea.resourceFit} compact />{idea.retained && <small>선택한 사업 유지 · 변경된 조건 검토 필요</small>}</>}</span>
          </label>{idea && <details className={styles.disclosure}><summary>{option.label} 자세히 보기</summary><p>{idea.description}</p>{idea.reasons.length > 0 && <p className={styles.optionReason}>{idea.reasons.join(" · ")}</p>}{idea.cautions.length > 0 && <p className={styles.optionCaution}>확인할 점: {idea.cautions.join(" · ")}</p>}<ResourceFitDetails fit={idea.resourceFit} /></details>}</div>;
        })}
      </fieldset>)}
      {candidate && <label className={styles.customToggle}><input type="checkbox" checked={draft.custom} onChange={event => onChange({ ...draft, custom: event.target.checked, selected: [], unknown: false, ksic: undefined })} />직접 생각한 사업 입력</label>}
      {hybrid && inChat && suggestions?.pending && <SuggestionPlaceholder />}
      {hybrid && inChat && suggestions && !suggestions.pending && <SuggestionChips question={question} draft={draft} disabled={disabled} suggestions={suggestions.items} groups={groups} onChange={onChange} />}
      {hybrid && <HybridChips question={question} draft={draft} disabled={disabled} groups={groups} revealed={revealed} extraPicked={suggestions && !suggestions.pending ? pickedSuggestions(question, draft, suggestions.items) : 0} onChange={onChange} />}
      {ticket && <AmountLadder question={question} ranges={ticketRanges} disabled={disabled} staging={inChat} exactLabel="정확한 금액 알아요 (기록 있음)" onCommit={commit} onRange={range => stage(`${range.label} (예상)`)} onExact={amount => stage(`${formatWon(amount)} (실제 기록)`)} />}
      {prefill && <div className={styles.chipStep} role="group" aria-label="문장 시작 선택">
        <div className={styles.chipRow}>{options.map(option => <button key={option.value} type="button" className={styles.chip} data-selected={draft.text.trim() === option.label || undefined} disabled={disabled} onClick={() => onChange({ ...draft, custom: false, selected: [], unknown: false, text: option.label })}>{option.label}</button>)}</div>
        {!question.hint && <p className={styles.chipHelp}>탭하면 입력창에 채워져요. ○○ 자리는 직접 바꾸고 보내 주세요.</p>}
      </div>}
      {basisOptions.length > 0 && <div className={styles.chipStep} role="group" aria-label="가격 기준">
        <p className={styles.stepLegend}>가격 기준</p>
        <div className={styles.chipRow}>{basisOptions.map(option => <button key={option.value} type="button" className={styles.chip} aria-pressed={draft.selected.includes(option.value)} data-selected={draft.selected.includes(option.value) || undefined} disabled={disabled} onClick={() => onChange({ ...draft, custom: false, unknown: false, selected: [option.value] })}>{option.label}</button>)}</div>
      </div>}
      {numeric && question.id === "price" && snapshot.intake.mode !== "operating" && <CostPriceHelper disabled={disabled} onCommit={commit} />}
      {numeric && !candidate && (question.unit === "원"
        ? (!basisOptions.length || basis) && <AmountLadder key={basis ?? "ladder"} question={question} ranges={ranges} legend={months && months > 1 ? `${months}개월 합계 기준` : undefined} disabled={disabled} staging={inChat} onCommit={commit} />
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
      {inChat && <button type="button" className={styles.unknownChoice} aria-pressed={!!draft.unknown} disabled={disabled} onClick={() => onChange({ ...draft, text: "", custom: false, selected: [], unknown: !draft.unknown, ksic: undefined })}><strong>아직 정하지 않았어요</strong></button>}
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
  </section>;
}

/** hybrid_text_chips (spec §2): step chips write the assembled sentence into `draft.text`; the composer only supplements it. */
/** 이 사업에 맞춘 AI 추천 칩. 업종 칩과 같은 답변에 자유 문장 조각으로 합쳐지고, 다시 누르면 빠진다. */
const pickedSuggestions = (question: IntakeQuestion, draft: AnswerDraft, suggestions: string[] | undefined) => {
  const pieces = unmatchedPieces(question, draft.text);
  return suggestions?.filter(suggestion => pieces.includes(suggestion)).length ?? 0;
};

/** 추천이 아직 오는 중일 때 같은 자리를 잡아 둔다. 도착하면 칩으로 바뀌어 아래 선택지가 밀리지 않는다. */
function SuggestionPlaceholder() {
  return <div className={`${styles.chipStep} ${styles.suggestionStep}`} role="status" aria-label="이 사업에 맞춘 추천 준비 중">
    <p className={styles.stepLegend}><Sparkles size={13} aria-hidden="true" />이 사업에 맞춘 추천<span>준비하고 있어요…</span></p>
    <div className={styles.chipRow} aria-hidden="true">{[300, 240, 270].map(width => <span key={width} className={styles.suggestionSkeleton} style={{ width }} />)}</div>
  </div>;
}

function SuggestionChips({ question, draft, disabled, suggestions, groups, onChange }: {
  question: IntakeQuestion; draft: AnswerDraft; disabled: boolean; suggestions: string[]; groups: ReturnType<typeof optionGroups>; onChange: (value: AnswerDraft) => void;
}) {
  const pieces = unmatchedPieces(question, draft.text);
  // "최대 N개" 질문은 업종 칩과 추천을 합쳐 N개까지. 한 개만 고르는 질문은 추천끼리 바꿔 끼운다.
  const limit = chipLimit(question.id);
  const chipPicks = groups.filter(group => !isFilterGroup(group.name)).reduce((sum, group) => sum + group.options.filter(option => draft.selected.includes(option.value)).length, 0);
  const full = limit > 1 && chipPicks + pickedSuggestions(question, draft, suggestions) >= limit;
  const toggle = (suggestion: string) => {
    const next = pieces.includes(suggestion) ? pieces.filter(piece => piece !== suggestion) : [...(limit > 1 ? pieces : pieces.filter(piece => !suggestions.includes(piece))), suggestion];
    onChange({ ...draft, custom: false, unknown: false, text: assembleHybridText(question, draft.selected, next) });
  };
  return <div className={`${styles.chipStep} ${styles.suggestionStep}`} role="group" aria-label="이 사업에 맞춘 추천">
    <p className={styles.stepLegend}><Sparkles size={13} aria-hidden="true" />이 사업에 맞춘 추천<span>AI 제안 · 누르면 입력칸에 들어가요</span></p>
    <div className={styles.chipRow}>{suggestions.map(suggestion => {
      const selected = pieces.includes(suggestion);
      return <button key={suggestion} type="button" className={`${styles.chip} ${styles.suggestionChip}`} aria-pressed={selected} data-selected={selected || undefined} disabled={disabled || !selected && full} onClick={() => toggle(suggestion)}>{suggestion}</button>;
    })}</div>
  </div>;
}

function HybridChips({ question, draft, disabled, groups, revealed, extraPicked = 0, onChange }: {
  question: IntakeQuestion; draft: AnswerDraft; disabled: boolean; groups: ReturnType<typeof optionGroups>; revealed: (index: number) => boolean;
  /** 같은 한도에 포함되는 맞춤 추천 선택 수 */
  extraPicked?: number; onChange: (value: AnswerDraft) => void;
}) {
  const limit = chipLimit(question.id);
  const update = (selected: string[]) => onChange({ ...draft, custom: false, unknown: false, selected, text: assembleHybridText(question, selected, unmatchedPieces(question, draft.text)) });
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
    return <div key={group.name ?? index} className={styles.chipStep} role="group" aria-label={title || question.label} data-step={groups.length > 1 ? index + 1 : undefined}>
      {(title || stepLimit > 1) && <p className={styles.stepLegend}>{title}{stepLimit > 1 && <span>{`최대 ${stepLimit}개 · ${picked}/${stepLimit}`}</span>}</p>}
      <div className={styles.chipRow}>{group.options.map(option => {
        const selected = draft.selected.includes(option.value);
        return <button key={option.value} type="button" className={styles.chip} aria-pressed={selected} data-selected={selected || undefined} disabled={disabled || !selected && stepLimit > 1 && picked >= stepLimit} onClick={() => tap(option.value)}>{option.label}{option.hint && <small className={styles.chipHint}>{option.hint}</small>}</button>;
      })}</div>
    </div>;
  }), countUnit !== undefined && <CountStep key="count" question={question} unit={countUnit} count={count} disabled={disabled} onCount={value => update(withCount(draft.selected, value))} />]}</div>;
}

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
/** 원가로 판매가 계산 — 1개당 원가와 원가 비율을 고르면 판매가를 제안하고, 누르면 가격 답으로 넣는다 */
function CostPriceHelper({ disabled, onCommit }: { disabled: boolean; onCommit: (value: IntakeValue) => void }) {
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
      <button type="button" className={styles.secondaryButton} disabled={disabled} onClick={() => onCommit(wonAnswer(result.price))}>이 가격으로 입력<Check size={17} aria-hidden="true" /></button>
    </div>}
  </details>;
}

function AmountLadder({ question, ranges, legend, disabled, staging, exactLabel = "정확히 입력", onCommit, onRange, onExact }: {
  question: IntakeQuestion; ranges: AmountRange[]; legend?: string; disabled: boolean; staging: boolean; exactLabel?: string;
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
  };
  const pick = (index: number) => {
    const item = ranges[index];
    if (onRange) { onRange(item); return; } // text mode: the range label itself becomes the answer text
    if (item.min === 0 && item.max === 0 || item.max === 0) return onCommit("0원");
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
        {range.min !== null && range.min > 0 && <button type="button" className={styles.chip} disabled={disabled} onClick={() => onCommit(wonAnswer(range.min!))}>하한 {wonLabel(range.min)}</button>}
        {range.max !== null && <button type="button" className={styles.chip} disabled={disabled} onClick={() => onCommit(wonAnswer(range.max!))}>상한 {wonLabel(range.max)}</button>}
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

export function ChatSpeaker() {
  return <span className={styles.chatSpeaker}><img src="/support-agent-avatar-2026.png" alt="" width="28" height="28" /><span>오늘창업</span></span>;
}

export function ReplyTyping() {
  return <div className={styles.replyTyping} data-reply-typing><ChatSpeaker /><LoadingStatus note="다음 질문을 준비하고 있어요" /></div>;
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

export function ConversationHistory({ snapshot, onEdit }: { snapshot: IntakeSnapshot; onEdit: (id: string) => void }) {
  const mode = { exploring: "아이디어를 찾고 있어요", startup: "생각한 사업이 있어요", operating: "사업을 운영 중이에요" }[snapshot.intake.mode];
  return <div className={styles.chatHistory} aria-label="지금까지의 대화">
    <div className={styles.assistantMessage}><ChatSpeaker /><p>어떤 사업을 생각하고 계세요?</p></div>
    <article className={styles.userMessage} data-coach-message="user"><p>{mode}</p></article>
    {snapshot.coach.messages.map(message => {
      if (snapshot.intake.job?.kind === "design" && message.id === `${snapshot.intake.job.id}:reply` && snapshot.coach.design?.sourceRevision === (snapshot.coach.documentRevision ?? snapshot.coach.revision)) return null;
      const answerEntry = Object.entries(snapshot.intake.answers).find(([, answer]) => answer.messageId === message.id);
      const notes = snapshot.intake.notes.filter(note => note.id.startsWith(`${message.id}:`) && /^\d+$/.test(note.id.slice(message.id.length + 1)));
      // Older message labels are display-only; edits always use the current stable question ID.
      const question = message.role === "user" && !notes.length ? snapshot.questions.find(question => answerEntry ? question.id === answerEntry[0] : message.text.startsWith(`${question.label}: `)) : undefined;
      const text = answerEntry?.[1].status === "unknown" ? "아직 정하지 않았어요" : question && message.text.startsWith(`${question.label}: `) ? message.text.slice(question.label.length + 2) : message.text;
      return <div key={message.id} className={styles.chatTurn}>
        {question && <div className={styles.assistantMessage}><ChatSpeaker /><p>{question.prompt}</p></div>}
        <article className={message.role === "user" ? styles.userMessage : styles.assistantMessage} data-coach-message={message.role}>
          {message.role === "assistant" ? <><ChatSpeaker /><ConversationText text={text} /></> : <p>{text}</p>}
          {answerEntry && question && <button type="button" className={styles.messageEdit} title="이 답변 수정" aria-label={`${question.label} 답변 수정`} onClick={() => onEdit(question.id)}><PencilLine size={14} /></button>}
        </article>
        {notes.length > 0 && <p className={styles.messageStatus}>{notes.some(note => note.status === "failed") ? "입력은 저장됨 · 자동 정리는 미완료" : notes.some(note => note.status === "queued" || note.status === "processing") ? "입력은 저장됨 · 자동 정리 중" : notes.some(note => note.status === "review") ? "입력은 저장됨 · 정리한 내용 확인 필요" : "입력은 저장됨"}</p>}
      </div>;
    })}
  </div>;
}

export function AnswerHistory({ snapshot, drafts, onEdit, onKeepAsMemo }: { snapshot: IntakeSnapshot; drafts: Record<string, AnswerDraft>; onEdit: (id: string) => void; onKeepAsMemo: (id: string) => void }) {
  const draftIds = Object.keys(drafts);
  const orphaned = draftIds.filter(id => !snapshot.questions.some(question => question.id === id) && !["business", "industry"].includes(id));
  const questions = snapshot.questions.filter(question => snapshot.intake.answers[question.id] || (question.fieldKey && snapshot.coach.fields.some(field => field.key === question.fieldKey && field.basis === "user")) || draftIds.includes(question.id));
  if (!questions.length && !orphaned.length) return null;
  return <>{orphaned.length > 0 && <section className={styles.recoveredDrafts} aria-labelledby="intake-recovered-heading"><h3 id="intake-recovered-heading">이전 질문에 입력한 내용</h3>{orphaned.map(id => <div key={id}><strong>{drafts[id].label || "이전 질문 답변"}</strong><p>{drafts[id].text || drafts[id].selected.join(", ") || "빈 답변"}</p><button type="button" className={styles.textButton} onClick={() => onKeepAsMemo(id)}>자유 메모로 가져오기</button></div>)}</section>}{questions.length > 0 && <details className={styles.history}><summary>이전 답변 <span>{questions.length}</span></summary><ul>{questions.map(question => {
    const answer = snapshot.intake.answers[question.id];
    const labelled = answer && answer.status !== "unknown" ? Array.isArray(answer.value) ? answer.value.map(item => question.options?.find(option => option.value === item)?.label ?? item).join(", ") : question.options?.find(option => option.value === answer.value)?.label ?? (summaryAnswerText(question, answer.value, snapshot.candidateIdeas) || answerText(answer.value)) : "";
    /* 업종은 고른 세부 업종(화초 및 식물 소매업)을 앞에 — 큰 분류만 보이면 다른 걸 고른 줄 안다 */
    const value = answer ? answer.status === "unknown" ? "아직 정하지 않았어요" : question.id === "industry" && snapshot.ksic ? `${snapshot.ksic.name} · ${labelled}` : labelled : coachFieldDisplay(snapshot.coach.fields.find(field => field.key === question.fieldKey)?.value ?? "");
    return <li key={question.id}><div><strong>{question.label}</strong><p>{plainText(value) || "아직 저장하지 않은 답변"}</p>{draftIds.includes(question.id) && <small>이 기기에 입력 중인 내용이 있어요</small>}</div><button className={styles.iconButton} type="button" title={`${question.label} 수정`} aria-label={`${question.label} 수정`} onClick={() => onEdit(question.id)}><PencilLine size={17} /></button></li>;
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
  return <section className={styles.notes} aria-labelledby="intake-notes-heading"><div className={styles.sectionHeading}><h3 id="intake-notes-heading">저장한 메모</h3>{notes.some(note => ["failed", "queued"].includes(note.status)) && <button type="button" className={styles.textButton} disabled={disabled} onClick={onExtract}><Sparkles size={16} aria-hidden="true" />메모 정리</button>}</div><ul>{[...notes].reverse().map(note => <li key={note.id}><div className={styles.noteMeta}><span data-failed={note.status === "failed"}>{labels[note.status]}</span><time dateTime={note.at}>{new Date(note.at).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}</time></div><p>{note.text}</p>{note.status === "failed" && <small>메모 원문은 저장되어 있습니다.</small>}</li>)}</ul></section>;
}

const STRUCTURE_AXIS_LABEL: Record<StructureAxis, string> = { payer: "고객·지불자", offering: "제공하는 것", delivery: "전달 방식", revenue: "수익 방식", sides: "시장 구조", license: "인허가" };

const JOB_TITLES: Record<"extract" | "help" | "design" | "ideas", string> = { extract: "저장한 메모 정리 중", design: "사업 방향 정리 중", help: "AI 답변 작성 중", ideas: "새 사업 후보 제안 중" };
const monotonicNow = () => typeof performance !== "undefined" ? performance.now() : Date.now();

/** Show server status and elapsed time without presenting an estimated completion percentage. */
export function JobProgress({ snapshot, announce = false }: { snapshot: IntakeSnapshot; announce?: boolean }) {
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
function RewriteCost({ snapshot }: { snapshot: IntakeSnapshot }) {
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
  const short = !!known && count !== undefined && count > known.remaining;
  return <p className={styles.rewriteCost} data-short={short || undefined} role="status">
    {count === undefined ? <>바뀐 내용과 맞지 않는 항목만 다시 써요 · 항목마다 다시 생성 횟수 1회가 차감돼요{known ? <> (남은 횟수 {known.remaining}/{known.allowed}회)</> : null}</> : count > 0 ? <>바뀐 내용에 맞춰 <b>{count}개 항목</b>을 다시 써요{known ? <> · 다시 생성 횟수 <b>{count}회</b> 차감 (남은 횟수 {known.remaining}/{known.allowed}회)</> : <> · 항목마다 다시 생성 횟수 1회가 차감돼요</>}</> : "직접 고친 항목은 그대로 두고, 바뀐 내용과 맞지 않는 항목만 다시 써요."}
    {short && <> — 횟수가 {count! - known!.remaining}회 모자라요. <Link href={`/plan/pay?planId=${encodeURIComponent(snapshot.planId)}&planType=${encodeURIComponent(snapshot.planType)}&product=regen`}>{quota?.pack ? `${quota.pack.count}회 추가 (${quota.pack.amount.toLocaleString("ko-KR")}원)` : "다시 생성 횟수 추가"}</Link></>}
  </p>;
}

export function NextStepAction({ snapshot, prepared, disabled, aiBusy, onDesign, onPrepare, secondary, announce = false }: {
  snapshot: IntakeSnapshot; prepared: boolean; disabled: boolean; aiBusy: boolean; onDesign: () => void; onPrepare: () => void; secondary?: ReactNode; announce?: boolean;
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
    : step === "prepare" ? `지금까지 만든 건 사업 방향 요약이에요. 이 버튼을 누르면 이 내용으로 정식 사업계획서 문서를 작성해요. 전체는 ${sectionCount}개 항목(재무표 포함)이고, 결제 전에는 앞 ${FREE_SECTION_COUNT}개 항목을 무료로 만들어요. 몇 분 걸리고, 다 되면 바로 열 수 있어요.`
    : "사업계획서 문서는 언제든 다시 열 수 있어요.";
  const reapply = step === "prepare" && snapshot.hasDocuments && snapshot.documentStatus === "stale";
  return <div className={styles.nextStep} data-active data-step={step}>
    <ol className={styles.stepper} aria-label="진행 단계">
      <li data-state={step === "design" ? "current" : "done"}>{step === "design" ? <span>1</span> : <Check size={13} aria-hidden="true" />}사업 방향 요약</li>
      <li data-state={step === "prepare" ? "current" : step === "open" ? "done" : "todo"}>{step === "open" ? <Check size={13} aria-hidden="true" /> : <span>2</span>}사업계획서 문서 작성</li>
    </ol>
    {jobActive ? <JobProgress snapshot={snapshot} announce={announce} /> : <div className={styles.nextStepRow}>
      {step === "design" && <button type="button" className={styles.primaryButton} disabled={locked} onClick={onDesign}><Sparkles size={18} aria-hidden="true" />사업 방향 정리하기</button>}
      {step === "prepare" && <button type="button" className={styles.primaryButton} disabled={locked} onClick={onPrepare}><FileText size={18} aria-hidden="true" />{snapshot.documentStatus === "stale" ? "바뀐 내용으로 사업계획서 다시 작성하기" : "사업계획서 문서 작성하기"}</button>}
      {step === "prepare" && snapshot.hasDocuments && <Link className={styles.textButton} href={`/plan/document?planId=${encodeURIComponent(snapshot.planId)}`}>이전 계획서 보기</Link>}
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
    <p className={styles.identityKicker}><Sparkles size={14} aria-hidden="true" />이런 사업, 맞죠? <small>AI 제안</small></p>
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

export function DesignDirection({ snapshot }: { snapshot: IntakeSnapshot }) {
  const design = snapshot.coach.design;
  if (!design || design.sourceRevision !== (snapshot.coach.documentRevision ?? snapshot.coach.revision)) return null;
  return <section className={styles.direction} aria-label="정리한 사업 방향">
    <p className={styles.eyebrow}>1단계 결과 · 사업 방향 요약 (AI 제안, 검증 전)</p>
    <h3>이렇게 시작해 볼까요?</h3>
    <ConversationText text={design.startingPlan.scope} />
    <div className={styles.nextAction}><h3>먼저 해볼 일 하나 <small>선택 사항</small></h3><ConversationText text={design.nextAction.action} /></div>
    <details className={styles.disclosure}><summary>제안 이유와 실행 예시 보기</summary>
      <h4>제안 이유</h4><p>{design.startingPlan.whyThis}</p><p>{design.startingPlan.connectionToVision}</p>
      <h4>바로 쓸 문구</h4><p>{design.nextAction.usableText}</p><h4>완료 기준</h4><p>{design.nextAction.doneWhen}</p>
      {design.startingPlan.notIncluded.length > 0 && <><h4>이번에 포함하지 않은 것</h4><ul>{design.startingPlan.notIncluded.map((text, index) => <li key={index}>{text}</li>)}</ul></>}
      {design.assumptions.length > 0 && <><h4>아직 확인할 내용</h4><ul>{design.assumptions.map((item, index) => <li key={index}>{item.statement}<p>{item.howToCheck}</p></li>)}</ul></>}
    </details>
  </section>;
}

export function BusinessSummary({ snapshot, disabled, aiBusy, prepared, onEdit, onDetails, onDesign, onPrepare, onStructure, showActions = true }: {
  snapshot: IntakeSnapshot; disabled: boolean; aiBusy: boolean; prepared: boolean;
  onEdit: (questionId: string) => void; onDetails: () => void; onDesign: () => void; onPrepare: () => void;
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
    const ksicLine = ksic ? `${display || shown} · KSIC ${ksic.code}` : null;
    const main = ksic ? ksic.name : display;
    return <div key={item.id}><dt><span>{item.label}</span><small data-basis={item.basis}>{item.basis === "proposal" ? "AI 제안" : item.basis === "unknown" ? "아직 안 정함" : "내가 입력함"}</small>{editableId && <button type="button" className={styles.iconButton} aria-label={`${item.label} 수정`} title={`${item.label} 수정`} onClick={() => onEdit(editableId)}><PencilLine size={15} /></button>}</dt><dd><ConversationText text={main || "아직 정하지 않았어요"} />{ksicLine && <small className={styles.ksicNote}>{ksicLine}</small>}</dd></div>;
  };
  return <>
    <div className={styles.summaryHeading}><p className={styles.eyebrow}>{snapshot.intake.mode === "operating" ? "운영 중인 사업" : "사업 구상"}</p><h2 id="intake-summary-heading">현재까지 작성한 사업정보</h2><p>{snapshot.coreComplete ? "기본 질문 입력 완료" : `기본 질문 ${snapshot.coreAnswered} / ${snapshot.coreTotal}`}</p></div>
    {snapshot.financialWarning && <div className={styles.financialWarning} role="note">
      <p>{snapshot.financialWarning.message}</p>
      {onEdit && <div>{snapshot.financialWarning.fields.map(key => { const id = key === "price" ? "price" : key === "unitCost" ? "structure.unitCost" : "structure.cost"; const label = key === "price" ? "가격 다시 입력" : key === "unitCost" ? "변동비 다시 입력" : "고정비 다시 입력"; return <button key={key} type="button" className={styles.presetChip} disabled={disabled} onClick={() => { if (id.startsWith("structure.") && !snapshot.intake.detailsRequested) onDetails(); else onEdit(id); }}><PencilLine size={14} aria-hidden="true" />{label}</button>; })}</div>}
    </div>}
    {nextStep && actions}
    <BusinessIdentityHero snapshot={snapshot} compact />
    {original && <section className={styles.original}><h3>내 사업 구상</h3><ConversationText text={original} /></section>}
    {highlights.length > 0 && <dl className={styles.summaryFields}>{highlights.map(renderField)}</dl>}
    {(remaining.length > 0 || extraAnswers.length > 0) && <details className={styles.summaryDetails} open><summary>다른 답변 보기 ·{remaining.length + extraAnswers.length}개</summary><dl className={styles.summaryFields}>{remaining.map(renderField)}{extraAnswers.map(question => <div key={question.id}><dt><span>{question.label}</span><button type="button" className={styles.iconButton} aria-label={`${question.label} 수정`} title={`${question.label} 수정`} onClick={() => onEdit(question.id)}><PencilLine size={15} /></button></dt><dd><ConversationText text={snapshot.intake.answers[question.id].status === "unknown" ? "아직 정하지 않았어요" : plainText(summaryAnswerText(question, snapshot.intake.answers[question.id].value, snapshot.candidateIdeas)) || plainText(answerText(snapshot.intake.answers[question.id].value)) || "아직 정하지 않았어요"} /></dd></div>)}</dl></details>}
    {!snapshot.summary.length && !extraAnswers.length && <p className={styles.muted}>아직 저장한 답변이 없습니다.</p>}
    {snapshot.structure && <details className={`${styles.structure} ${styles.summaryDetails}`}>
      <summary>고객·제공 방식 바꾸기</summary>
      <p className={styles.muted}>{snapshot.ksic ? "표준산업분류" : "업종"}로 추정한 내용이에요. 직접 고른 내용과 구분해 표시했어요.</p>
      {snapshot.structure.fallback === "unclassified" && <p className={styles.muted}>업종이 미분류라 기본값이 넓게 잡혀 있어요. 아래 다섯 축을 직접 고르면 질문과 계산이 그 구조를 따라가요.</p>}
      {snapshot.structure.fallback === "compound" && <p className={styles.muted}>여러 업종이 섞인 사업으로 보여요. 매출이 가장 큰 업종을 기준으로 두고, 섞인 축은 복합을 골라 주세요.</p>}
      <dl className={styles.summaryFields}>{STRUCTURE_AXES.map(axis => {
        const value = snapshot.structure!.values[axis] as string;
        const labels = STRUCTURE_LABELS[axis] as Record<string, string>;
        const basis = snapshot.structure!.basis[axis];
        const open = structureEdit === axis;
        return <div key={axis}><dt><span>{STRUCTURE_AXIS_LABEL[axis]}</span><small>{basis === "user" ? "직접 선택" : basis === "ksic" ? "분류 기준" : "업종 기준"}</small>{onStructure && <button type="button" className={styles.iconButton} aria-label={`${STRUCTURE_AXIS_LABEL[axis]} 수정`} title={`${STRUCTURE_AXIS_LABEL[axis]} 수정`} aria-expanded={open} disabled={disabled} onClick={() => setStructureEdit(open ? null : axis)}><PencilLine size={15} /></button>}</dt>
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
    {design && <details className={styles.design}><summary><Sparkles size={16} aria-hidden="true" />AI 사업안{staleDesign ? " · 이전 입력 기준" : " · 제안"}</summary><h3>시작할 범위</h3><p>{design.startingPlan.scope}</p><p>{design.startingPlan.connectionToVision}</p><h3>제안 이유</h3><p>{design.startingPlan.whyThis}</p><h3>확인할 가정</h3><ul>{design.assumptions.map((assumption, index) => <li key={index}>{assumption.statement}<p>{assumption.howToCheck}</p></li>)}</ul></details>}
    {showActions && !nextStep && <small className={styles.nextStepHint}>{snapshot.coreComplete ? "사업 소개를 정하면 사업 방향을 정리할 수 있어요." : "기본 질문을 마치면 사업 방향을 정리할 수 있어요."}</small>}
    {(snapshot.hasDocuments || prepared) && <nav className={styles.artifactLinks} aria-label="저장한 결과물">{showActions || nextStep !== "open" ? <Link href={`/plan/document?planId=${encodeURIComponent(snapshot.planId)}`}><FileText size={17} aria-hidden="true" />계획서 열기<ArrowRight size={16} aria-hidden="true" /></Link> : null}<Link href={`/plan/workspace?planId=${encodeURIComponent(snapshot.planId)}`}>사업 관리<ArrowRight size={16} aria-hidden="true" /></Link></nav>}
  </>;
}
