"use client";

import { ArrowRight, PencilLine, RefreshCw, Undo2, X } from "lucide-react";
import styles from "../intake.module.css";
import { StatusBadge } from "../../../../components/status-badge";
import { ChatSpeaker, ReplyTyping } from "./IntakePanels";
import { queuedRequestStatus, sectionHint, studioTargetChipText, type QueuedStudioRequest, type StudioEditTurn } from "./studio-edit";

/*
 * 작업실 대화 칸 끝에 붙는 '대화로 고치기' 기록 — 손님 말 하나와 "이렇게 바꿀게요" 카드 하나가 한 묶음이다.
 * 카드의 단추는 오른쪽 칸의 처리기(StudioEditHandler)를 부르고, 결과는 BusinessIntake 가 상태로 바꿔 다시 그린다.
 */
export function StudioEditTurns({ turns, disabled = false, onApply, onDismiss, onUndo, onRetry, onAction, pro = false }: {
  turns: StudioEditTurn[];
  disabled?: boolean;
  onApply: (turn: StudioEditTurn) => void;
  onDismiss: (turn: StudioEditTurn) => void;
  onUndo: (turn: StudioEditTurn) => void;
  onRetry: (turn: StudioEditTurn) => void;
  /** 실패 카드의 다음 행동 단추(결제하기 등) — 주소로 이동한다 */
  onAction?: (href: string) => void;
  /** 작업실 PC: 카드 머리의 군데 수 · 지금 → 바꿀 글 화살표 · [바꾸기] [취소] · 되돌릴 수 있다는 안내 */
  pro?: boolean;
}) {
  if (!turns.length) return null;
  return <div className={styles.studioEdits} data-studio-edits>
    {/* data-studio-item — 대화 칸이 마지막 것을 찾아 다 보이게 내린다(scrollToCurrent) */}
    {turns.map(turn => <section key={turn.id} data-studio-item className={styles.studioEditTurn} aria-label={studioTargetChipText(turn.label)} data-studio-edit={turn.status}>
      <article className={styles.userMessage} data-coach-message="user"><p>{turn.instruction}</p></article>
      <p className={styles.messageStatus}>{studioTargetChipText(turn.label)}</p>
      <EditReply turn={turn} disabled={disabled} onApply={onApply} onDismiss={onDismiss} onUndo={onUndo} onRetry={onRetry} onAction={onAction} pro={pro} />
    </section>)}
  </div>;
}

function EditReply({ turn, disabled, onApply, onDismiss, onUndo, onRetry, onAction, pro }: { turn: StudioEditTurn; disabled: boolean; onApply: (turn: StudioEditTurn) => void; onDismiss: (turn: StudioEditTurn) => void; onUndo: (turn: StudioEditTurn) => void; onRetry: (turn: StudioEditTurn) => void; onAction?: (href: string) => void; pro: boolean }) {
  if (turn.status === "proposing") return <ReplyTyping />;
  if (turn.status === "note") return <div className={styles.assistantMessage}><ChatSpeaker /><p>이 요청은 메모로 남겨 뒀어요. 지금은 대화로 바로 고칠 수 없어서, 계획서에서 문장을 눌러 직접 고칠 수 있어요.</p></div>;
  /* 결제 전처럼 다시 해도 같은 실패면 [다시 시도] 대신 다음 행동 단추(함께 결제하기 등)를 둔다 — 예전엔 눌러도 같은 말만 반복됐다 */
  if (turn.status === "failed") return <div className={styles.assistantMessage}><ChatSpeaker /><p>{turn.error || "바꾸지 못했어요. 다시 시도해 주세요."}</p>
    <div className={styles.chipRow}>{turn.action && onAction
      ? <button type="button" className={`${styles.chip} ${styles.chipStrong}`} onClick={() => onAction(turn.action!.href)}>{turn.action.label}</button>
      : <button type="button" className={styles.chip} disabled={disabled} onClick={() => onRetry(turn)}><span className={styles.studioEditButton}><RefreshCw size={14} aria-hidden="true" />다시 시도</span></button>}</div>
  </div>;
  const proposal = turn.proposal;
  if (!proposal) return null;
  const applied = turn.status === "applied" || turn.status === "undoing";
  const working = turn.status === "applying" || turn.status === "undoing";
  const heading = turn.status === "applied" ? "바꿨어요" : turn.status === "applying" ? "바꾸는 중…" : turn.status === "undoing" ? "되돌리는 중…" : turn.status === "undone" ? "되돌렸어요" : turn.status === "dismissed" ? "그대로 뒀어요" : "이렇게 바꿀게요";
  /* 그대로 두기 · 되돌리기를 한 카드는 접어서 요약만 남긴다 */
  const closed = turn.status === "dismissed" || turn.status === "undone";
  return <div className={styles.assistantMessage}>
    <ChatSpeaker />
    <div className={styles.changeCard} data-studio-proposal={turn.status} aria-busy={working || undefined}>
      <b>{pro && <PencilLine size={14} className={styles.changeIcon} aria-hidden="true" />}{heading}{pro && !closed && proposal.changes.length > 0 && <span className={styles.changeCount}>{proposal.changes.length}군데</span>}</b>
      <p className={styles.studioEditSummary}>{proposal.summary}</p>
      {!closed && proposal.changes.map((change, index) => <p key={`${change.label}:${index}`}><span>{change.label}</span>{change.before && <s>{change.before}</s>}{pro && change.before && <ArrowRight size={13} className={styles.changeArrow} aria-hidden="true" />}<strong>{change.after}</strong></p>)}
      {!closed && proposal.cost && <small>{proposal.cost}</small>}
      {turn.archived && <small>이전 화면에서 만든 제안이에요 · 다시 바꾸려면 원하는 내용을 다시 말씀해 주세요</small>}
      {turn.status === "proposed" && !turn.archived && <div className={styles.chipRow}>
        <button type="button" className={`${styles.chip} ${styles.chipStrong}`} disabled={disabled} onClick={() => onApply(turn)}>바꾸기</button>
        <button type="button" className={styles.chip} disabled={disabled} onClick={() => onDismiss(turn)}>{pro ? "취소" : "그대로 두기"}</button>
        {/* 작업실 고치기는 적용한 뒤에도 [되돌리기]가 있다(처리기의 undo) */}
        {pro && <small className={styles.changeUndoNote}>바꾼 뒤에도 되돌릴 수 있어요</small>}
      </div>}
      {applied && !turn.archived && <div className={styles.chipRow}>
        <button type="button" className={styles.chip} disabled={disabled || working} onClick={() => onUndo(turn)}><span className={styles.studioEditButton}><Undo2 size={14} aria-hidden="true" />되돌리기</span></button>
      </div>}
    </div>
  </div>;
}

/** 계획서를 쓰는 동안 보낸 요청 — 대화 끝에 손님 말풍선처럼 쌓고, 아래에 '대기 중' 한 줄과 [취소] */
export function QueuedStudioRequests({ items, generating, onCancel, onEdit, dock = false }: { items: QueuedStudioRequest[]; generating: boolean; onCancel: (id: string) => void;
  /** 작업실 PC: 입력창 바로 위 '다음 요청' 줄 — 연필은 그 글을 입력창으로 되돌려 고치게 한다(기다리던 요청에서는 뺀다) */
  dock?: boolean; onEdit?: (item: QueuedStudioRequest) => void }) {
  if (!items.length) return null;
  if (dock) return <div className={styles.queueDock} aria-label="기다리는 요청" data-studio-queue>
    {items.map(item => <div key={item.id} className={styles.queueRow} data-queued>
      <StatusBadge tone="info" className={styles.queueBadge}>다음 요청</StatusBadge>
      {/* 장 이름은 '[1장 사업 개요]' 날것 대신 작은 꼬리표로(PC 점검 2026-10-24) */}
      {item.section && sectionHint(item.section.label) && <StatusBadge tone="neutral" className={styles.queueTag}>{sectionHint(item.section.label)}</StatusBadge>}
      <span className={styles.queueText} title={item.text}>{item.text}</span>
      {onEdit && <button type="button" className={styles.queueButton} aria-label={`기다리는 요청 고치기: ${item.text.slice(0, 40)}`} title="고치기" onClick={() => onEdit(item)}><PencilLine size={14} aria-hidden="true" /></button>}
      <button type="button" className={styles.queueButton} aria-label={`기다리는 요청 취소: ${item.text.slice(0, 40)}`} title="취소" onClick={() => onCancel(item.id)}><X size={14} aria-hidden="true" /></button>
    </div>)}
    {/* '다음 요청' 이름표가 이미 기다린다는 뜻이라 '대기 중 · 다 쓰면 반영할게요' 줄은 두지 않는다(r37 점검) */}
  </div>;
  return <div className={styles.studioQueue} aria-label="기다리는 요청" data-studio-queue>
    {items.map(item => <div key={item.id} className={styles.studioQueued} data-studio-item>
      {item.section && sectionHint(item.section.label) && <p className={styles.bubbleTag}><StatusBadge tone="neutral">{sectionHint(item.section.label)}</StatusBadge></p>}
      <article className={styles.userMessage} data-coach-message="user" data-queued><p>{item.text}</p></article>
      <p className={styles.studioQueuedStatus}>{queuedRequestStatus(generating)}<button type="button" className={styles.studioQueuedCancel} aria-label={`기다리는 요청 취소: ${item.text.slice(0, 40)}`} onClick={() => onCancel(item.id)}><X size={13} aria-hidden="true" />취소</button></p>
    </div>)}
  </div>;
}
