"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, Check, CheckCircle2, ChevronRight, FileText, Lightbulb, ListFilter, PencilLine, Plus, Sparkles, Store, X } from "lucide-react";
import type { IntakeCommand, IntakeSnapshot, IntakeValue } from "../../../../lib/plan-builder/intake-types";
import type { IntakeMode, IntakeQuestion } from "../../../../lib/plan-builder/intake-questions";
import { COACH_FIELD_LABELS } from "../../../../lib/plan-builder/coach-presentation";
import { amountRanges, CHIP_GROUPS, formatWon, numberAnswer, numberPresetLabel, numberPresets, openEndPresets, periodMonths, scaledAmountRanges, stepFor, wonAnswer, wonLabel, type AmountRange } from "../../../../lib/plan-builder/intake-options";
import { answerText, assembleHybridText, candidateConflict, chipLimit, groupTitle, intakeChipSector, isFilterGroup, isHybridQuestion, isPrefillQuestion, metricNeedsCount, onlyFilterSelected, optionGroups, PERIOD_PRESETS, periodDates, periodPresetRange, plainText, readableFinancialSummary, selectedCount, stepVisible, suggestedIntakeIndustry, summaryAnswerText, toggleChip, unfinishedAnswerText, unmatchedPieces, withCount, type AnswerDraft } from "./model";
import { CoachWelcome } from "../../../../components/coach-chat-ui";
import styles from "../intake.module.css";

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

export function QuestionForm({ question, snapshot, draft, editing, disabled, onChange, onAnswer, onCancel, inChat = false }: {
  question: IntakeQuestion; snapshot: IntakeSnapshot; draft: AnswerDraft; editing: boolean; disabled: boolean;
  onChange: (value: AnswerDraft) => void; onAnswer: (value: IntakeValue, unknown?: boolean, questionId?: string) => void;
  onCancel: () => void; inChat?: boolean;
}) {
  const [manualIndustry, setManualIndustry] = useState(editing || draft.selected.length > 0);
  const seededPeriod = question.id === "period" ? periodDates(draft.text) : null;
  const [customPeriod, setCustomPeriod] = useState(!!seededPeriod);
  const [periodStart, setPeriodStart] = useState(seededPeriod?.[0] ?? "");
  const [periodEnd, setPeriodEnd] = useState(seededPeriod?.[1] ?? "");
  const suggested = inChat && question.id === "industry" && !editing ? suggestedIntakeIndustry(snapshot) : null;
  const showSuggested = !!suggested && !manualIndustry;
  const candidate = question.id === "candidate";
  const options = candidate ? snapshot.candidateIdeas.map(idea => ({ value: idea.id, label: idea.title })) : question.options ?? [];
  const commit = (value: IntakeValue) => { if (!disabled) onAnswer(value, false, question.id); };
  const choose = (value: string) => {
    const selected = question.kind === "multi" ? toggleChip(question, draft.selected, value) : [value];
    onChange({ ...draft, custom: false, selected });
    if (inChat && question.kind === "single" && !disabled) onAnswer(value, false, question.id);
  };
  const choice = !draft.custom && ["single", "multi"].includes(question.kind);
  const hybrid = isHybridQuestion(question);
  const prefill = isPrefillQuestion(question);
  const numeric = question.kind === "number";
  const value = choice ? question.kind === "multi" ? draft.selected : draft.selected[0] ?? "" : draft.text.trim();
  const valid = Array.isArray(value) ? value.length > 0 : String(value).length > 0;
  const submit = (event: FormEvent) => { event.preventDefault(); if (!disabled && valid) onAnswer(value, false, candidate && draft.custom ? "business" : question.id); };
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
  const hybridReady = (hybrid || ticket) && !!draft.text.trim() && !unfinishedAnswerText(draft.text) && !onlyFilterSelected(question, draft.selected);
  // Space price picks a basis (시간당 · 1박 · 월 멤버십) before its ladder; sales scales the monthly ladder by the reporting period.
  const basisOptions = numeric && question.options?.length ? options : [];
  const basis = basisOptions.find(option => draft.selected.includes(option.value))?.label;
  const months = question.id === "sales" ? periodMonths(answerText(snapshot.intake.answers.period?.value ?? null)) : null;
  const ladder = numeric && question.unit === "원" && (!basisOptions.length || basis) ? amountRanges(sector, question.id, snapshot.intake.mode, basis) : [];
  const ranges = months && months > 1 ? scaledAmountRanges(ladder, months) : ladder;
  const focusComposer = () => document.getElementById(`intake-answer-${question.id}`)?.focus();
  return <section className={`${styles.question} ${inChat ? styles.chatQuestion : ""}`} aria-labelledby="intake-question-heading" data-chat-question={inChat || undefined}>
    {inChat && <ChatSpeaker />}
    {(!inChat || editing) && <div className={styles.questionMeta}>
      <span>{editing ? "답변 수정" : inChat ? "" : snapshot.coreComplete ? "선택 상세 질문" : "기본 질문"}</span>
      {editing && <button type="button" className={styles.textButton} onClick={onCancel}>현재 질문으로</button>}
    </div>}
    <h2 id="intake-question-heading" tabIndex={-1}>{showSuggested ? "이 업종으로 정리할까요?" : question.prompt}</h2>
    {question.hint && !showSuggested && <p className={styles.questionHint}>{question.hint}</p>}
    {draft.hint && <p className={styles.draftHint}>이전 답변: {draft.hint}</p>}
    <form onSubmit={submit}>
      {showSuggested && <div className={styles.industrySuggestion} role="group" aria-label="추천 업종">
        <div className={styles.suggestedIndustry}><CheckCircle2 size={23} aria-hidden="true" /><strong>{suggested.label}</strong></div>
        <div className={styles.suggestionActions}>
          <button className={styles.primaryButton} type="button" disabled={disabled} onClick={() => onAnswer(suggested.value, false, question.id)}>이 업종으로 계속<ArrowRight size={17} aria-hidden="true" /></button>
          <button className={styles.textButton} type="button" disabled={disabled} aria-expanded="false" aria-controls="intake-industry-options" onClick={() => setManualIndustry(true)}><ListFilter size={16} aria-hidden="true" />직접 선택하기</button>
        </div>
      </div>}
      {suggested && manualIndustry && <button type="button" className={styles.textButton} disabled={disabled} onClick={() => setManualIndustry(false)}>추천 업종 보기</button>}
      {choice && !showSuggested && groups.map((group, index) => revealed(index) && <fieldset key={group.name ?? index} id={question.id === "industry" ? "intake-industry-options" : undefined} className={styles.options} data-step={groups.length > 1 ? index + 1 : undefined}>
        <legend className={groups.length > 1 && group.name ? styles.stepLegend : styles.srOnly}>{groups.length > 1 && group.name ? groupTitle(group.name) : question.label}</legend>
        {group.options.map(option => {
          const idea = candidate ? snapshot.candidateIdeas.find(item => item.id === option.value) : undefined;
          return <label key={option.value} className={styles.option} data-selected={draft.selected.includes(option.value)}>
            <input type={question.kind === "multi" ? "checkbox" : "radio"} name={`intake-${question.id}`} value={option.value} checked={draft.selected.includes(option.value)} disabled={inChat && disabled} onChange={() => choose(option.value)} />
            <span><strong>{option.label}</strong>{option.hint && <small className={styles.optionHint}>{option.hint}</small>}{idea && <><span className={styles.optionDescription}>{idea.description}</span>{idea.reasons.length > 0 && <span className={styles.optionReason}>{idea.reasons.join(" · ")}</span>}{idea.cautions.length > 0 && <span className={styles.optionCaution}>확인할 점: {idea.cautions.join(" · ")}</span>}</>}</span>
          </label>;
        })}
      </fieldset>)}
      {candidate && <label className={styles.customToggle}><input type="checkbox" checked={draft.custom} onChange={event => onChange({ ...draft, custom: event.target.checked, selected: [] })} />직접 생각한 사업 입력</label>}
      {hybrid && <HybridChips question={question} draft={draft} disabled={disabled} groups={groups} revealed={revealed} onChange={onChange} />}
      {ticket && <AmountLadder question={question} ranges={ticketRanges} disabled={disabled} exactLabel="정확한 금액 알아요 (기록 있음)" onCommit={commit} onRange={range => onChange({ ...draft, text: `${range.label} (예상)` })} onExact={amount => onChange({ ...draft, text: `${formatWon(amount)} (실제 기록)` })} />}
      {prefill && <div className={styles.chipStep} role="group" aria-label="문장 시작 선택">
        <div className={styles.chipRow}>{options.map(option => <button key={option.value} type="button" className={styles.chip} data-selected={draft.text.trim() === option.label || undefined} disabled={disabled} onClick={() => onChange({ ...draft, custom: false, selected: [], text: option.label })}>{option.label}</button>)}</div>
        {!question.hint && <p className={styles.chipHelp}>탭하면 입력창에 채워져요. ○○ 자리는 직접 바꾸고 보내 주세요.</p>}
      </div>}
      {basisOptions.length > 0 && <div className={styles.chipStep} role="group" aria-label="가격 기준">
        <p className={styles.stepLegend}>가격 기준</p>
        <div className={styles.chipRow}>{basisOptions.map(option => <button key={option.value} type="button" className={styles.chip} aria-pressed={draft.selected.includes(option.value)} data-selected={draft.selected.includes(option.value) || undefined} disabled={disabled} onClick={() => onChange({ ...draft, custom: false, selected: [option.value] })}>{option.label}</button>)}</div>
      </div>}
      {numeric && !candidate && (question.unit === "원"
        ? (!basisOptions.length || basis) && <AmountLadder key={basis ?? "ladder"} question={question} ranges={ranges} legend={months && months > 1 ? `${months}개월 합계 기준` : undefined} disabled={disabled} onCommit={commit} />
        : <NumberQuick question={question} draft={draft} presets={numberPresets(question)} disabled={disabled} onChange={onChange} onCommit={commit} />)}
      {period && <div className={styles.periodPicker} role="group" aria-label="실적 기간 선택">
        <div className={styles.presetChips}>
          {PERIOD_PRESETS.map(preset => <button key={preset.id} type="button" className={styles.presetChip} disabled={disabled} onClick={() => onAnswer(periodPresetRange(preset.id), false, question.id)}>{preset.label}</button>)}
          <button type="button" className={styles.presetChip} data-selected={customPeriod || undefined} aria-expanded={customPeriod} aria-controls="intake-period-range" disabled={disabled} onClick={() => setCustomPeriod(value => !value)}>직접 선택</button>
        </div>
        {customPeriod && <div id="intake-period-range" className={styles.dateRange}>
          <label><span>시작일</span><input type="date" value={periodStart} max={periodEnd || undefined} disabled={disabled} onChange={event => setPeriodStart(event.target.value)} /></label>
          <label><span>종료일</span><input type="date" value={periodEnd} min={periodStart || undefined} disabled={disabled} onChange={event => setPeriodEnd(event.target.value)} /></label>
          <button type="button" className={styles.primaryButton} disabled={disabled || !customPeriodValid} onClick={() => onAnswer(`${periodStart} / ${periodEnd}`, false, question.id)}>이 기간으로 저장<ArrowRight size={17} aria-hidden="true" /></button>
        </div>}
      </div>}
      {!choice && !inChat && <div className={styles.answerField}>
        <label className={styles.srOnly} htmlFor={`intake-answer-${question.id}`}>{candidate && draft.custom ? "직접 생각한 사업" : question.label}</label>
        {question.kind === "number" ? <div className={styles.numberField}><input id={`intake-answer-${question.id}`} type="text" inputMode="decimal" autoComplete="off" maxLength={80} value={draft.text} onChange={event => onChange({ ...draft, text: event.target.value })} aria-describedby={hintId} /><span>{question.unit}</span></div>
          : <textarea id={`intake-answer-${question.id}`} rows={5} maxLength={1200} value={draft.text} onChange={event => onChange({ ...draft, text: event.target.value })} aria-describedby={hintId} />}
        <p className={styles.fieldHint} id={hintId}>{question.kind === "number" ? `단위: ${question.unit || "숫자"}${question.period ? ` · ${question.period}` : ""}` : `${draft.text.length.toLocaleString("ko-KR")} / 1,200자`}</p>
      </div>}
      <div className={styles.formActions}>
        {inChat && (hybrid || ticket) && <button className={styles.primaryButton} type="button" disabled={disabled || !hybridReady} onClick={() => commit(draft.text.trim())}>이대로 저장<ArrowRight size={17} aria-hidden="true" /></button>}
        {inChat && choice && question.kind === "multi" && <button className={styles.primaryButton} type="button" disabled={disabled || draft.selected.length === 0} onClick={() => commit(draft.selected)}>선택 완료({draft.selected.length}개)<ArrowRight size={17} aria-hidden="true" /></button>}
        <button className={inChat ? styles.unknownButton : styles.secondaryButton} type="button" disabled={disabled} onClick={() => onAnswer(null, true, question.id)}>아직 미정</button>
        {inChat && (hybrid || ticket) && <button className={styles.unknownButton} type="button" disabled={disabled} onClick={focusComposer}>직접 입력</button>}
        {!inChat && <button className={styles.primaryButton} type="submit" disabled={disabled || !valid}>{editing ? "답변 수정" : "답변 저장"}<ArrowRight size={18} aria-hidden="true" /></button>}
      </div>
    </form>
  </section>;
}

/** hybrid_text_chips (spec §2): step chips write the assembled sentence into `draft.text`; the composer only supplements it. */
function HybridChips({ question, draft, disabled, groups, revealed, onChange }: {
  question: IntakeQuestion; draft: AnswerDraft; disabled: boolean; groups: ReturnType<typeof optionGroups>; revealed: (index: number) => boolean; onChange: (value: AnswerDraft) => void;
}) {
  const limit = chipLimit(question.id);
  const update = (selected: string[]) => onChange({ ...draft, custom: false, selected, text: assembleHybridText(question, selected, unmatchedPieces(question, draft.text)) });
  const tap = (value: string) => update(toggleChip(question, draft.selected, value));
  const picked = (group: string) => (question.options ?? []).find(option => option.group === group && draft.selected.includes(option.value));
  // Count step: capacity after its unit chip, goal for an "N건" metric. The count lives in draft.selected as "#n".
  const countUnit = question.id === "capacity" ? picked(CHIP_GROUPS.unit)?.label : question.id === "goal" && metricNeedsCount(picked(CHIP_GROUPS.metric)?.label) ? "건" : undefined;
  const count = selectedCount(draft.selected);
  return <div className={styles.chipSteps}>{[...groups.map((group, index) => {
    if (!revealed(index)) return null;
    const filter = isFilterGroup(group.name);
    const stepLimit = filter ? 1 : limit;
    const picked = group.options.filter(option => draft.selected.includes(option.value)).length;
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

/** Preset chips + stepper for a count inside a hybrid answer (capacity "하루 20건", goal "N건"); nothing is sent until "이대로 저장". */
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

/** number_quick (spec §2): preset chips send "${n}${unit}" at once; the stepper mirrors the composer text and saves the same shape. */
function NumberQuick({ question, draft, presets, disabled, onChange, onCommit }: {
  question: IntakeQuestion; draft: AnswerDraft; presets: number[]; disabled: boolean; onChange: (value: AnswerDraft) => void; onCommit: (value: IntakeValue) => void;
}) {
  const unit = question.unit ?? "";
  const current = draft.text.trim() && /^\d+(?:\.\d+)?$/.test(draft.text.trim()) ? Number.parseFloat(draft.text.trim()) : null;
  const max = question.fieldKey === "hoursPerWeek" ? 168 : Number.POSITIVE_INFINITY;
  const setValue = (next: number) => onChange({ ...draft, text: String(Math.min(max, Math.max(0, next))) });
  const step = stepFor(current ?? 0, unit);
  return <div className={styles.numberQuick}>
    {presets.length > 0 && <div className={styles.chipRow} role="group" aria-label="자주 고르는 값">{presets.map(preset => <button key={preset} type="button" className={styles.chip} data-selected={current === preset || undefined} disabled={disabled} onClick={() => onCommit(numberAnswer(preset, unit))}>{numberPresetLabel(question, preset)}</button>)}</div>}
    <div className={styles.stepper} role="group" aria-label="값 조정">
      <button type="button" className={styles.stepButton} aria-label={`${step}${unit} 줄이기`} disabled={disabled || (current ?? 0) <= 0} onClick={() => setValue((current ?? 0) - stepFor(Math.max(0, (current ?? 0) - 1), unit))}>−</button>
      <label className={styles.stepValue}><span className={styles.srOnly}>{question.label}</span><input type="text" inputMode="decimal" autoComplete="off" maxLength={12} placeholder="0" value={draft.text} onChange={event => onChange({ ...draft, text: event.target.value.replace(/[^\d.]/g, "") })} /><span>{unit}{question.period ? ` / ${question.period}` : ""}</span></label>
      <button type="button" className={styles.stepButton} aria-label={`${step}${unit} 늘리기`} disabled={disabled || (current ?? 0) >= max} onClick={() => setValue((current ?? 0) + step)}>+</button>
      <button type="button" className={styles.primaryButton} disabled={disabled || current === null || current > max} onClick={() => current !== null && onCommit(numberAnswer(current, unit))}>이 값으로 저장</button>
    </div>
  </div>;
}

/** range_chips_with_exact (spec §2): a won ladder, then lower / upper / exact (만원 keypad with a 원 toggle). Only "0원" sends from step 1. */
function AmountLadder({ question, ranges, legend, disabled, exactLabel = "정확히 입력", onCommit, onRange, onExact }: {
  question: IntakeQuestion; ranges: AmountRange[]; legend?: string; disabled: boolean; exactLabel?: string;
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
        <input id={`intake-exact-${question.id}`} type="text" inputMode="decimal" autoComplete="off" maxLength={14} placeholder="0" aria-label={`정확한 금액 (${unitScale === 10000 ? "만원" : "원"} 단위)`} value={amountText} onChange={event => setAmountText(event.target.value.replace(/[^\d.,]/g, ""))} />
        <div className={styles.unitToggle} role="group" aria-label="입력 단위">
          <button type="button" aria-pressed={unitScale === 10000} disabled={disabled} onClick={() => { if (unitScale !== 10000) { setUnitScale(10000); setAmountText(amount !== null && amount % 10000 === 0 ? String(amount / 10000) : ""); } }}>만원</button>
          <button type="button" aria-pressed={unitScale === 1} disabled={disabled} onClick={() => { if (unitScale !== 1) { setUnitScale(1); setAmountText(amount !== null ? String(amount) : ""); } }}>원 단위</button>
        </div>
      </div>
      <p className={styles.keypadPreview}>{amount !== null ? `= ${formatWon(amount)}${question.period ? ` / ${question.period}` : ""}` : "숫자만 입력해 주세요"}</p>
      <button type="button" className={styles.primaryButton} disabled={disabled || amount === null} onClick={() => { if (amount === null) return; if (onExact) { onExact(amount); setKeypad(false); } else onCommit(wonAnswer(amount)); }}>{onExact ? "이 금액으로 적기" : "이 금액으로 저장"}<ArrowRight size={17} aria-hidden="true" /></button>
    </div>}
  </div>;
}

export function ChatSpeaker() {
  return <span className={styles.chatSpeaker}><img src="/support-agent-avatar-2026.png" alt="" width="28" height="28" /><span>오늘창업</span></span>;
}

export function ReplyTyping() {
  return <div className={styles.replyTyping} data-reply-typing role="status" aria-label="다음 질문 준비 중"><ChatSpeaker /><span className={styles.typingDots} aria-hidden="true"><i /><i /><i /></span></div>;
}

export function ConversationHistory({ snapshot, onEdit }: { snapshot: IntakeSnapshot; onEdit: (id: string) => void }) {
  const mode = { exploring: "아이디어를 찾고 있어요", startup: "생각한 사업이 있어요", operating: "사업을 운영 중이에요" }[snapshot.intake.mode];
  return <div className={styles.chatHistory} aria-label="지금까지의 대화">
    <div className={styles.assistantMessage}><ChatSpeaker /><p>어떤 사업을 생각하고 계세요?</p></div>
    <article className={styles.userMessage} data-coach-message="user"><p>{mode}</p></article>
    {snapshot.coach.messages.map(message => {
      const answerEntry = Object.entries(snapshot.intake.answers).find(([, answer]) => answer.messageId === message.id);
      const notes = snapshot.intake.notes.filter(note => note.id.startsWith(`${message.id}:`));
      // Older message labels are display-only; edits always use the current stable question ID.
      const question = message.role === "user" && !notes.length ? snapshot.questions.find(question => answerEntry ? question.id === answerEntry[0] : message.text.startsWith(`${question.label}: `)) : undefined;
      const text = question && message.text.startsWith(`${question.label}: `) ? message.text.slice(question.label.length + 2) : message.text;
      return <div key={message.id} className={styles.chatTurn}>
        {question && <div className={styles.assistantMessage}><ChatSpeaker /><p>{question.prompt}</p></div>}
        <article className={message.role === "user" ? styles.userMessage : styles.assistantMessage} data-coach-message={message.role}>
          {message.role === "assistant" && <ChatSpeaker />}<p>{text}</p>
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
    const value = answer ? answer.status === "unknown" ? "아직 미정" : Array.isArray(answer.value) ? answer.value.map(item => question.options?.find(option => option.value === item)?.label ?? item).join(", ") : question.options?.find(option => option.value === answer.value)?.label ?? answerText(answer.value) : snapshot.coach.fields.find(field => field.key === question.fieldKey)?.value;
    return <li key={question.id}><div><strong>{question.label}</strong><p>{plainText(value) || "아직 저장하지 않은 답변"}</p>{draftIds.includes(question.id) && <small>이 기기에 입력 중인 내용이 있어요</small>}</div><button className={styles.iconButton} type="button" title={`${question.label} 수정`} aria-label={`${question.label} 수정`} onClick={() => onEdit(question.id)}><PencilLine size={17} /></button></li>;
  })}</ul></details>}</>;
}

export function ExtractionReview({ snapshot, disabled, onCommand }: { snapshot: IntakeSnapshot; disabled: boolean; onCommand: (command: Pick<IntakeCommand, "action" | "candidateIds" | "rejectIds" | "overwriteIds">) => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [overwrites, setOverwrites] = useState<Record<string, string | null>>({});
  const candidates = snapshot.intake.candidates.filter(candidate => candidate.status === "pending");
  const chosen = candidates.filter(candidate => selected.includes(candidate.id));
  const ready = chosen.length > 0 && new Set(chosen.map(candidate => candidate.fieldKey)).size === chosen.length && chosen.every(candidate => {
    const conflict = candidateConflict(snapshot, candidate);
    return !conflict.requiresOverwrite || Object.hasOwn(overwrites, candidate.id) && overwrites[candidate.id] === conflict.current;
  });
  if (!candidates.length) return null;
  return <section className={styles.review} aria-labelledby="intake-review-heading"><h3 id="intake-review-heading">메모에서 찾은 내용 <span>{candidates.length}</span></h3>
    <div className={styles.candidateList}>{candidates.map(candidate => {
      const conflict = candidateConflict(snapshot, candidate);
      const approved = Object.hasOwn(overwrites, candidate.id) && overwrites[candidate.id] === conflict.current;
      return <article className={styles.extractedCandidate} key={candidate.id}>
        <label className={styles.candidateSelection}><input type="checkbox" checked={selected.includes(candidate.id)} onChange={event => setSelected(previous => event.target.checked ? [...previous, candidate.id] : previous.filter(id => id !== candidate.id))} /><strong>{COACH_FIELD_LABELS[candidate.fieldKey]}</strong></label>
        <dl><div><dt>현재 값</dt><dd>{plainText(conflict.current) || "미입력"}</dd></div><div><dt>메모에서 찾은 값</dt><dd>{plainText(candidate.value) || "표시할 수 없는 값"}</dd></div></dl>
        <blockquote>{plainText(candidate.quote)}</blockquote>
        {conflict.requiresOverwrite && <div className={styles.overwrite}><p>{conflict.changed ? "정리하는 동안 현재 값이 바뀌었어요." : "입력된 값과 다른 내용이에요."}</p><label><input type="checkbox" checked={approved} onChange={event => setOverwrites(previous => { const next = { ...previous }; if (event.target.checked) next[candidate.id] = conflict.current; else delete next[candidate.id]; return next; })} />현재 값을 이 내용으로 바꾸기</label></div>}
      </article>;
    })}</div>
    {new Set(chosen.map(candidate => candidate.fieldKey)).size < chosen.length && <p className={styles.error} role="alert">같은 항목은 하나만 선택해 주세요.</p>}
    <div className={styles.formActions}><button type="button" className={styles.secondaryButton} disabled={disabled || !chosen.length} onClick={() => onCommand({ action: "confirm-extraction", rejectIds: chosen.map(candidate => candidate.id) })}><X size={17} aria-hidden="true" />선택 제외</button><button type="button" className={styles.primaryButton} disabled={disabled || !ready} onClick={() => onCommand({ action: "confirm-extraction", candidateIds: chosen.map(candidate => candidate.id), overwriteIds: chosen.filter(candidate => candidateConflict(snapshot, candidate).requiresOverwrite).map(candidate => candidate.id) })}><Check size={17} aria-hidden="true" />선택 반영</button></div>
  </section>;
}

export function SavedNotes({ snapshot, disabled, onExtract }: { snapshot: IntakeSnapshot; disabled: boolean; onExtract: () => void }) {
  const labels = { queued: "정리 대기", processing: "정리 중", review: "확인 필요", stored: "보관됨", failed: "정리 실패" };
  const notes = snapshot.intake.notes;
  if (!notes.length) return <p className={styles.muted}>저장한 메모가 없습니다.</p>;
  return <section className={styles.notes} aria-labelledby="intake-notes-heading"><div className={styles.sectionHeading}><h3 id="intake-notes-heading">저장한 메모</h3>{notes.some(note => ["failed", "queued"].includes(note.status)) && <button type="button" className={styles.textButton} disabled={disabled} onClick={onExtract}><Sparkles size={16} aria-hidden="true" />메모 정리</button>}</div><ul>{[...notes].reverse().map(note => <li key={note.id}><div className={styles.noteMeta}><span data-failed={note.status === "failed"}>{labels[note.status]}</span><time dateTime={note.at}>{new Date(note.at).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}</time></div><p>{note.text}</p>{note.status === "failed" && <small>메모 원문은 저장되어 있습니다.</small>}</li>)}</ul></section>;
}

export function BusinessSummary({ snapshot, disabled, aiBusy, prepared, onEdit, onDetails, onDesign, onPrepare }: {
  snapshot: IntakeSnapshot; disabled: boolean; aiBusy: boolean; prepared: boolean;
  onEdit: (questionId: string) => void; onDetails: () => void; onDesign: () => void; onPrepare: () => void;
}) {
  const original = plainText(answerText(snapshot.intake.answers.business?.value ?? null)) || plainText(snapshot.coach.ideaOrigin?.text) || plainText(snapshot.coach.fields.find(field => field.key === "business" && field.basis === "user")?.value);
  const design = snapshot.coach.design;
  const staleDesign = !!design && design.sourceRevision !== (snapshot.coach.documentRevision ?? snapshot.coach.revision);
  const extraAnswers = snapshot.questions.filter(question => !snapshot.summary.some(item => item.id === (question.fieldKey ?? question.id)) && snapshot.intake.answers[question.id]);
  return <>
    <div className={styles.summaryHeading}><p className={styles.eyebrow}>{snapshot.intake.mode === "operating" ? "운영 중인 사업" : "사업 구상"}</p><h2 id="intake-summary-heading">입력한 사업 요약</h2><p>{snapshot.coreComplete ? "기본 질문 입력 완료" : `기본 질문 ${snapshot.coreAnswered} / ${snapshot.coreTotal}`}</p></div>
    {original && <section className={styles.original}><h3>내 사업 구상</h3><p>{original}</p></section>}
    <dl className={styles.summaryFields}>{snapshot.summary.map(item => {
      const question = snapshot.questions.find(question => question.id === item.id || question.fieldKey === item.id);
      const editableId = question?.id ?? (["business", "industry"].includes(item.id) ? item.id : null);
      const shown = plainText(item.value);
      // Display only: attach unit and period to numbers, thousands-format amounts, show candidate titles. Storage keeps the raw strings.
      const display = shown && question ? summaryAnswerText(question, item.basis === "unknown" ? null : shown, snapshot.candidateIdeas) || shown : shown;
      return <div key={item.id}><dt><span>{item.label}</span><small>{item.basis === "proposal" ? "AI 제안" : item.basis === "unknown" ? "미정" : "입력한 내용"}</small>{editableId && <button type="button" className={styles.iconButton} aria-label={`${item.label} 수정`} title={`${item.label} 수정`} onClick={() => onEdit(editableId)}><PencilLine size={15} /></button>}</dt><dd>{display || "아직 미정"}</dd></div>;
    })}{extraAnswers.map(question => <div key={question.id}><dt><span>{question.label}</span><button type="button" className={styles.iconButton} aria-label={`${question.label} 수정`} title={`${question.label} 수정`} onClick={() => onEdit(question.id)}><PencilLine size={15} /></button></dt><dd>{snapshot.intake.answers[question.id].status === "unknown" ? "아직 미정" : plainText(summaryAnswerText(question, snapshot.intake.answers[question.id].value, snapshot.candidateIdeas)) || plainText(answerText(snapshot.intake.answers[question.id].value)) || "아직 미정"}</dd></div>)}</dl>
    {!snapshot.summary.length && !extraAnswers.length && <p className={styles.muted}>아직 저장한 답변이 없습니다.</p>}
    <section className={styles.financial}><h3>금액과 운영 수치</h3><p>{readableFinancialSummary(snapshot)}</p></section>
    {snapshot.coreComplete && !snapshot.intake.detailsRequested && <button type="button" className={styles.detailButton} disabled={disabled} onClick={onDetails}><Plus size={18} aria-hidden="true" />상세 질문 4개 추가</button>}
    {design && <details className={styles.design}><summary><Sparkles size={16} aria-hidden="true" />AI 사업안{staleDesign ? " · 이전 입력 기준" : " · 제안"}</summary><h3>시작할 범위</h3><p>{design.startingPlan.scope}</p><p>{design.startingPlan.connectionToVision}</p><h3>제안 이유</h3><p>{design.startingPlan.whyThis}</p><h3>확인할 가정</h3><ul>{design.assumptions.map((assumption, index) => <li key={index}>{assumption.statement}<p>{assumption.howToCheck}</p></li>)}</ul></details>}
    <div className={styles.summaryActions}>
      <button type="button" className={styles.primaryButton} disabled={disabled || aiBusy || !snapshot.coreComplete || !snapshot.coach.ready} onClick={onDesign}><Sparkles size={18} aria-hidden="true" />이 내용으로 사업안 만들기</button>
      <button type="button" className={styles.secondaryButton} disabled={disabled || aiBusy || !snapshot.coach.ready} onClick={onPrepare}><FileText size={18} aria-hidden="true" />계획서 만들기</button>
      {prepared && <p role="status" className={styles.success}>계획서 작성을 시작했어요.</p>}
    </div>
    {(snapshot.hasDocuments || prepared) && <nav className={styles.artifactLinks} aria-label="저장한 결과물"><Link href={`/plan/document?planId=${encodeURIComponent(snapshot.planId)}`}><FileText size={17} aria-hidden="true" />계획서 열기<ArrowRight size={16} aria-hidden="true" /></Link><Link href={`/plan/workspace?planId=${encodeURIComponent(snapshot.planId)}`}>사업 관리<ArrowRight size={16} aria-hidden="true" /></Link></nav>}
  </>;
}
