"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export type SuggestionMap = Partial<Record<string, string[]>>;

/**
 * 첫 사업 설명에 맞춘 답변 추천을 받아 둔다(시험 기능). 서버가 꺼져 있거나(204) 실패하면 조용히 비어 있고,
 * 화면은 기존 업종 칩만 보여 준다. 추천은 그 설명으로 새로 만든 사업에만 붙는다 — 다른 사업을 열면 보이지 않는다.
 */
export function useAnswerSuggestions(planId: string | null | undefined) {
  const [state, setState] = useState<{ planId: string | null; suggestions: SuggestionMap } | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  // 요청 시점에는 아직 사업이 없으므로, 처음 열린 사업에 추천을 붙인다.
  useEffect(() => {
    if (planId) setState(current => current && !current.planId ? { ...current, planId } : current);
  }, [planId]);

  const request = useCallback(async (text: string, stage: "startup" | "operating") => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ planId: null, suggestions: {} });
    try {
      const response = await fetch("/api/plan/chat/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, stage }),
        signal: controller.signal,
      });
      if (response.status !== 200) return;
      const body = await response.json() as { suggestions?: unknown };
      if (controllerRef.current !== controller || !body.suggestions || typeof body.suggestions !== "object") return;
      const suggestions: SuggestionMap = {};
      for (const [key, value] of Object.entries(body.suggestions as Record<string, unknown>)) {
        const list = Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && !!item.trim()).slice(0, 3) : [];
        if (list.length) suggestions[key] = list;
      }
      setState(current => current ? { ...current, suggestions } : current);
    } catch {
      // 추천은 보조 기능이라 실패를 알리지 않는다.
    }
  }, []);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setState(null);
  }, []);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const forQuestion = (questionId: string | undefined) =>
    questionId && state && planId && state.planId === planId ? state.suggestions[questionId] : undefined;

  return { request, cancel, forQuestion };
}
