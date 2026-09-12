"use client";

import { useEffect, useRef, useState } from "react";
import { cacheDocumentSection, type Plan, type StoredSection } from "../../../lib/plan-builder/plan-store";
import { htmlToMarkdown } from "../../../lib/plan-builder/html-to-markdown";

type Draft = { id: string; html: string; baseGeneratedAt: string };
export type EditState = { status: "saving" | "saved" | "failed"; message?: string };
const storageKey = (planId: string, key: string) => `oneul-document-draft:${planId}:${key}`;
export function useDocumentEdits(onSaved: (key: string, section: StoredSection) => void) {
  const [states, setStates] = useState<Record<string, EditState>>({});
  const [restoreKeys, setRestoreKeys] = useState<string[]>([]);
  const plan = useRef<Plan | null>(null);
  const drafts = useRef<Record<string, Draft>>({});
  const queue = useRef(Promise.resolve());
  const restoring = useRef(new Set<string>());
  const restoreAttempts = useRef<Record<string, Draft>>({});
  const latestSaved = useRef(onSaved); latestSaved.current = onSaved;
  function state(key: string, value: EditState) { setStates(current => ({ ...current, [key]: value })); }
  function remember(key: string, draft: Draft) {
    drafts.current[key] = draft;
    try { localStorage.setItem(storageKey(plan.current!.id, key), JSON.stringify(draft)); return true; } catch { return false; }
  }
  function initialize(value: Plan) {
    drafts.current = {};
    setStates({});
    plan.current = structuredClone(value);
    setRestoreKeys(Object.keys(value.sections).filter(key => !!value.sections[key].previous));
    const recovered: Record<string, string> = {};
    for (const [key, section] of Object.entries(value.sections)) {
      try {
        const draft = JSON.parse(localStorage.getItem(storageKey(value.id, key)) || "null") as Draft | null;
        if (!draft || typeof draft.id !== "string" || typeof draft.html !== "string" || typeof draft.baseGeneratedAt !== "string") continue;
        if (htmlToMarkdown(draft.html) === section.markdown) { localStorage.removeItem(storageKey(value.id, key)); continue; }
        drafts.current[key] = draft; recovered[key] = draft.html;
        state(key, { status: "failed", message: "저장하지 못한 초안을 복구했어요. 내용을 확인한 뒤 다시 저장해주세요." });
      } catch { /* An unreadable local draft must not replace the server document. */ }
    }
    return recovered;
  }
  async function send(key: string, draft: Draft, action: "save" | "restore") {
    const target = plan.current;
    if (!target || (action === "save" && drafts.current[key]?.id !== draft.id)) return;
    state(key, { status: "saving" });
    try {
      const response = await fetch("/api/plan/document/section", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId: target.id, key, baseGeneratedAt: draft.baseGeneratedAt, action, ...(action === "save" ? { markdown: htmlToMarkdown(draft.html) } : {}) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "저장하지 못했어요. 초안은 이 기기에 남아 있습니다.");
      const section = data.section as StoredSection;
      target.sections[key] = section;
      delete restoreAttempts.current[key];
      cacheDocumentSection(target.id, key, section, data.updatedAt);
      setRestoreKeys(current => current.includes(key) ? current : [...current, key]);
      const pending = drafts.current[key];
      if (!pending || pending.id === draft.id) {
        delete drafts.current[key];
        try { localStorage.removeItem(storageKey(target.id, key)); } catch {}
        latestSaved.current(key, section); state(key, { status: "saved" });
      } else remember(key, { ...pending, baseGeneratedAt: section.generatedAt });
    } catch (error) {
      const backedUp = drafts.current[key] ? remember(key, drafts.current[key]) : true;
      state(key, { status: "failed", message: backedUp ? (error instanceof Error ? error.message : "저장하지 못했어요.") : "서버와 기기에 저장하지 못했어요. 이 화면을 닫지 말고 다시 저장해주세요." });
    } finally { restoring.current.delete(key); }
  }
  function stage(key: string, html: string) {
    if (!plan.current?.sections[key]) return;
    const draft: Draft = { id: crypto.randomUUID(), html, baseGeneratedAt: drafts.current[key]?.baseGeneratedAt ?? plan.current.sections[key].generatedAt };
    const stored = remember(key, draft);
    state(key, stored ? { status: "saving" } : { status: "failed", message: "기기에 초안을 보관하지 못했어요. 서버 저장이 끝날 때까지 화면을 닫지 마세요." });
    return draft;
  }
  function save(key: string, html: string) {
    const draft = drafts.current[key]?.html === html ? drafts.current[key] : stage(key, html);
    if (!draft) return;
    queue.current = queue.current.then(() => send(key, drafts.current[key]?.id === draft.id ? drafts.current[key] : draft, "save"));
  }
  function retry(key: string) {
    const draft = drafts.current[key];
    if (draft) queue.current = queue.current.then(() => send(key, drafts.current[key] ?? draft, "save"));
    else if (restoreAttempts.current[key] && !restoring.current.has(key)) {
      restoring.current.add(key); state(key, { status: "saving" });
      queue.current = queue.current.then(() => send(key, restoreAttempts.current[key], "restore"));
    }
  }
  function discard(key: string) {
    if (!plan.current || !window.confirm("이 기기에 보관한 수정 초안을 버리고 서버 내용을 불러올까요?")) return;
    localStorage.removeItem(storageKey(plan.current.id, key)); delete drafts.current[key]; window.location.reload();
  }
  function restore(key: string) {
    const section = plan.current?.sections[key];
    if (!section?.previous || drafts.current[key] || restoring.current.has(key) || !window.confirm("직전 저장 내용으로 되돌릴까요? 현재 내용도 이전 버전으로 보관됩니다.")) return;
    restoring.current.add(key); state(key, { status: "saving" });
    const draft = { id: crypto.randomUUID(), html: section.previous.html, baseGeneratedAt: section.generatedAt };
    restoreAttempts.current[key] = draft;
    queue.current = queue.current.then(() => send(key, draft, "restore"));
  }
  function hasPending() { return Object.keys(drafts.current).length > 0 || restoring.current.size > 0; }
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (hasPending()) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  return { states, restoreKeys, initialize, stage, save, retry, discard, restore, hasPending, pending: Object.values(states).some(s => s.status === "saving" || s.status === "failed") };
}
