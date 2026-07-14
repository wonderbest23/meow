"use client";

import { CheckCircle2, Eye, EyeOff, FlaskConical, KeyRound, LoaderCircle, ShieldCheck, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";

type ConnectionStatus = {
  connected: boolean;
  model: string;
  source: "session" | "environment" | "none";
  keyHint: string | null;
  connectedAt: string | null;
  expiresAt: string | null;
};

const initialStatus: ConnectionStatus = {
  connected: false,
  model: "gpt-5.6-sol",
  source: "none",
  keyHint: null,
  connectedAt: null,
  expiresAt: null,
};

export function OpenAISettings({ light = false }: { light?: boolean }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ConnectionStatus>(initialStatus);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(initialStatus.model);
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState<"idle" | "loading" | "connecting" | "testing" | "deleting">("loading");
  const [message, setMessage] = useState("");

  const closeDialog = () => {
    setOpen(false);
    setApiKey("");
    setShowKey(false);
    setMessage("");
  };

  const loadStatus = async () => {
    setBusy("loading");
    try {
      const response = await fetch("/api/settings/openai", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "연결 상태를 확인하지 못했습니다.");
      setStatus(payload.status);
      setModel(payload.status.model);
      setApiKey("");
      setShowKey(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "연결 상태를 확인하지 못했습니다.");
    } finally {
      setBusy("idle");
    }
  };

  useEffect(() => {
    void loadStatus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && busy === "idle") closeDialog();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, busy]);

  const connect = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy("connecting");
    setMessage("");
    try {
      const changingModelOnly = status.connected && apiKey.length === 0;
      const response = await fetch("/api/settings/openai", {
        method: changingModelOnly ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changingModelOnly ? { model } : { apiKey, model }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "OpenAI를 연결하지 못했습니다.");
      setStatus(payload.status);
      setApiKey("");
      setShowKey(false);
      setMessage(changingModelOnly
        ? "모델 전환을 확인했습니다. 다음 문서 생성부터 적용됩니다."
        : "연결을 확인했습니다. 다음 문서 생성부터 이 모델을 사용합니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "OpenAI를 연결하지 못했습니다.");
    } finally {
      setBusy("idle");
    }
  };

  const testGeneration = async () => {
    setBusy("testing");
    setMessage("");
    try {
      const response = await fetch("/api/settings/openai/test", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "실제 생성 테스트에 실패했습니다.");
      setMessage(`실제 생성 성공 · 사용 모델 ${payload.result.resolvedModel} · 응답 ${payload.result.latencyMs.toLocaleString("ko-KR")}밀리초`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "실제 생성 테스트에 실패했습니다.");
    } finally {
      setBusy("idle");
    }
  };

  const disconnect = async () => {
    setBusy("deleting");
    setMessage("");
    try {
      const response = await fetch("/api/settings/openai", { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "세션 키를 삭제하지 못했습니다.");
      setStatus(payload.status);
      setModel(payload.status.model);
      setApiKey("");
      setMessage(payload.status.connected
        ? "세션 키를 삭제했습니다. 서버 환경변수 연결은 유지됩니다."
        : "세션 키를 삭제했습니다. 템플릿 기반 생성으로 돌아갑니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "세션 키를 삭제하지 못했습니다.");
    } finally {
      setBusy("idle");
    }
  };

  return (
    <>
      <button
        className={`openai-settings-trigger ${light ? "light" : ""} ${status.connected ? "connected" : ""}`}
        aria-label="인공지능 연결 설정"
        title="인공지능 연결 설정"
        onClick={() => { setOpen(true); setMessage(""); void loadStatus(); }}
      >
        <KeyRound />
        <i aria-hidden="true" />
      </button>

      {open && (
        <div
          className="openai-settings-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && busy === "idle") closeDialog();
          }}
        >
          <section className="openai-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="openai-settings-title">
            <header>
              <div><span><KeyRound /></span><div><small>인공지능 연결 설정</small><h2 id="openai-settings-title">OpenAI 연결</h2></div></div>
              <button aria-label="설정 닫기" title="닫기" onClick={closeDialog} disabled={busy !== "idle"}><X /></button>
            </header>

            <div className={`openai-connection-status ${status.connected ? "connected" : "disconnected"}`}>
              {busy === "loading" ? <LoaderCircle className="spin" /> : status.connected ? <CheckCircle2 /> : <KeyRound />}
              <div>
                <strong>{busy === "loading" ? "연결 상태 확인 중" : status.connected ? "OpenAI 연결됨" : "아직 연결되지 않음"}</strong>
                <span>{status.connected ? `${status.model} · ${status.keyHint}` : "키가 없어도 템플릿 기반 베타테스트는 가능합니다."}</span>
              </div>
            </div>

            <form onSubmit={connect}>
              <label>
                <span>OpenAI 연결키(API 키)</span>
                <div className="openai-secret-input">
                  <input
                    type={showKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value.trim())}
                    placeholder="sk-..."
                    autoComplete="off"
                    spellCheck={false}
                    minLength={20}
                    maxLength={500}
                    required={!status.connected}
                  />
                  <button type="button" onClick={() => setShowKey((visible) => !visible)} aria-label={showKey ? "연결키 숨기기" : "연결키 보기"} title={showKey ? "연결키 숨기기" : "연결키 보기"}>
                    {showKey ? <EyeOff /> : <Eye />}
                  </button>
                </div>
              </label>
              <label>
                <span>사용 모델(처음에는 기본 추천값 그대로 사용)</span>
                <input value={model} onChange={(event) => setModel(event.target.value.trim())} list="openai-model-options" minLength={2} maxLength={100} required />
                <datalist id="openai-model-options">
                  <option value="gpt-5.6-sol" />
                  <option value="gpt-5.6-terra" />
                  <option value="gpt-5.6-luna" />
                  <option value="gpt-5.4-mini" />
                </datalist>
              </label>
              <button
                className="openai-connect-button"
                disabled={busy !== "idle" || model.length < 2 || (!status.connected && apiKey.length < 20) || (apiKey.length > 0 && apiKey.length < 20)}
              >
                {busy === "connecting" ? <LoaderCircle className="spin" /> : <ShieldCheck />}
                {busy === "connecting" ? "연결 확인 중" : status.connected && !apiKey ? "모델 확인하고 변경" : status.connected ? "새 키로 다시 연결" : "키 확인하고 연결"}
              </button>
              {status.connected && (
                <button type="button" className="openai-smoke-button" onClick={testGeneration} disabled={busy !== "idle"}>
                  {busy === "testing" ? <LoaderCircle className="spin" /> : <FlaskConical />}
                  {busy === "testing" ? "실제 응답 생성 중" : "실제 생성 테스트"}
                </button>
              )}
            </form>

            <div className="openai-key-notice">
              <ShieldCheck />
              <p><strong>세션 전용 보관</strong>키 원문은 브라우저 저장소와 Supabase에 저장하지 않습니다. 현재 서버 메모리에 최대 4시간 보관되며 서버 재시작 또는 삭제 시 사라집니다.</p>
            </div>

            {message && <p className="openai-settings-message" role="status">{message}</p>}

            {status.source === "session" && (
              <footer>
                <span>만료 {status.expiresAt ? new Date(status.expiresAt).toLocaleString("ko-KR") : "서버 종료 시"}</span>
                <button onClick={disconnect} disabled={busy !== "idle"}><Trash2 /> 세션 키 삭제</button>
              </footer>
            )}
          </section>
        </div>
      )}
    </>
  );
}
