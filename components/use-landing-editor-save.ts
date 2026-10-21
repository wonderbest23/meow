"use client";

import { useEffect, useRef, useState } from "react";
import type { LandingPageData } from "../lib/landing/page-data";
import { userErrorMessage } from "../lib/client/user-error";

export function useLandingEditorSave(onSave: (data: LandingPageData) => void | Promise<void>) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  /** 오류 종류(LandingSaveError.code) — 로그인 풀림·충돌이면 편집기가 다음 할 일 단추를 붙인다 */
  const [errorCode, setErrorCode] = useState("");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const save = async (data: LandingPageData) => {
    if (pending.current) return false;
    pending.current = true; setSaving(true); setError(""); setErrorCode("");
    try { await onSave(data); if (mounted.current) setSavedAt(new Date().toISOString()); return true; }
    catch (cause) { if (mounted.current) { setError(userErrorMessage(cause, "저장하지 못했어요. 수정 내용은 그대로 있어요.")); setErrorCode(cause instanceof Error && "code" in cause && typeof cause.code === "string" ? cause.code : ""); } return false; }
    finally { pending.current = false; if (mounted.current) setSaving(false); }
  };
  const clearError = () => { setError(""); setErrorCode(""); };
  return { saving, error, errorCode, savedAt, save, clearError };
}
