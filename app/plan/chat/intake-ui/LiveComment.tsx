"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChatSpeaker } from "./IntakePanels";
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

/*
 * AI 한마디는 따로 뜨는 '참고 의견' 상자가 아니라 진행자의 답장 말풍선으로 보인다(2026-11-28 사장님: 자체 모델 전까지는 AI 가 바로 답하는 게 맞다).
 * 글이 오기 전에는 입력 중 점, 오면 글자가 흘러나온다. 저장하지 않는 것은 그대로(대화 기록에 남지 않는다).
 */
export function LiveComment({ comment }: { comment: LiveCommentState; onDismiss?: () => void }) {
  if (!comment) return null;
  return <div className={styles.assistantMessage} data-live-reply aria-live="polite" aria-busy={comment.streaming}>
    <ChatSpeaker />
    {comment.text ? <p>{comment.text}{comment.streaming && <span className={styles.liveCaret} aria-hidden="true" />}</p> : <span className={styles.typingBubble} aria-label="답을 쓰고 있어요"><i /><i /><i /></span>}
  </div>;
}
