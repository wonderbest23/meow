"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Sparkles, X } from "lucide-react";
import styles from "../intake.module.css";

export type LiveCommentState = { text: string; streaming: boolean } | null;

/**
 * 첫 사업 설명에 대한 AI 참고 의견을 받아 온다(시험 기능). 서버가 꺼져 있거나(204) 실패하면
 * 아무것도 보여 주지 않는다 — 규격 질문 진행은 이 요청과 무관하게 계속된다.
 */
export function useLiveComment() {
  const [comment, setComment] = useState<LiveCommentState>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const request = useCallback(async (text: string) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    let received = "";
    try {
      const response = await fetch("/api/plan/chat/comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });
      if (response.status !== 200 || !response.body) return;
      setComment({ text: "", streaming: true });
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let event: { type?: string; text?: unknown };
          try { event = JSON.parse(line); } catch { continue; }
          if (event.type === "delta" && typeof event.text === "string") {
            received += event.text;
            setComment({ text: received, streaming: true });
          }
        }
      }
    } catch {
      if (controller.signal.aborted) return;
    }
    if (controllerRef.current === controller) setComment(received.trim() ? { text: received.trim(), streaming: false } : null);
  }, []);

  const dismiss = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setComment(null);
  }, []);

  useEffect(() => () => controllerRef.current?.abort(), []);
  return { comment, request, dismiss };
}

export function LiveComment({ comment, onDismiss }: { comment: LiveCommentState; onDismiss: () => void }) {
  if (!comment) return null;
  return <aside className={styles.liveComment} aria-label="AI 참고 의견" aria-live="polite" aria-busy={comment.streaming}>
    <div className={styles.liveCommentHead}>
      <Sparkles size={15} aria-hidden="true" />
      <strong>AI 참고 의견</strong>
      <small>저장되지 않는 참고용이에요</small>
      <button type="button" className={styles.iconButton} aria-label="AI 참고 의견 닫기" title="닫기" onClick={onDismiss}><X size={15} aria-hidden="true" /></button>
    </div>
    <p>{comment.text || "의견을 쓰고 있어요"}{comment.streaming && <span className={styles.liveCaret} aria-hidden="true" />}</p>
  </aside>;
}
