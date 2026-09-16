"use client";

import { useEffect, useRef, useState } from "react";
import type { LandingPageData } from "../lib/landing/page-data";

export function useLandingEditorSave(onSave: (data: LandingPageData) => void | Promise<void>) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const save = async (data: LandingPageData) => {
    if (pending.current) return false;
    pending.current = true; setSaving(true); setError("");
    try { await onSave(data); if (mounted.current) setSavedAt(new Date().toISOString()); return true; }
    catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : "저장하지 못했습니다. 수정 내용은 유지했어요."); return false; }
    finally { pending.current = false; if (mounted.current) setSaving(false); }
  };
  return { saving, error, savedAt, save };
}
