"use client";

import { ExternalLink, Eye, EyeOff, LockKeyhole, RotateCcw, Save } from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { EDIT_SECTIONS, fieldsForSection, type SiteCopy } from "../../../lib/site-copy/domain";

/*
 * 어드민 — 메인 홈페이지 편집.
 *
 * 예전 화면은 입력칸을 길게 늘어놓고 체크박스로 섹션을 숨겼다. 어느 칸이 화면의
 * 어디인지 알 수 없어 쓸 수가 없었다(사용자 지적: "실제 화면 보여주고 섹션별로").
 * 지금은 왼쪽에 진짜 홈이 그대로 뜨고, 그 위에서 섹션을 골라 글을 고치거나 지운다.
 * 고치는 즉시 미리보기에 반영되고(저장 전), 저장해야 손님 화면에 나간다.
 */
type SessionState = { authenticated: boolean; configured: boolean };

async function payload<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) throw new Error((data as { error?: { message?: string } }).error?.message ?? "요청을 처리하지 못했습니다.");
  return data as T;
}

export default function AdminHomepagePage() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [password, setPassword] = useState("");
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [hidden, setHidden] = useState<string[]>([]);
  /* 저장된 값 — 저장 후 되돌리기(변경 취소) 기준 */
  const [saved, setSaved] = useState<SiteCopy>({ texts: {}, hidden: [] });
  const [selected, setSelected] = useState<string | null>("hero");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const frameRef = useRef<HTMLIFrameElement>(null);

  const load = async () => {
    const data = await payload<{ copy: SiteCopy }>(await fetch("/api/admin/site-copy", { cache: "no-store" }));
    setTexts(data.copy.texts);
    setHidden(data.copy.hidden);
    setSaved(data.copy);
  };

  useEffect(() => {
    void fetch("/api/admin/support/session", { cache: "no-store" })
      .then((response) => payload<SessionState>(response))
      .then((state) => { setSession(state); if (state.authenticated) void load().catch((error) => setMessage(error.message)); })
      .catch((error) => setMessage(error instanceof Error ? error.message : "세션을 확인하지 못했습니다."));
  }, []);

  /* 미리보기에 초안 보내기 — 고칠 때마다 즉시 */
  const pushDraft = useCallback((nextTexts: Record<string, string>, nextHidden: string[]) => {
    frameRef.current?.contentWindow?.postMessage({ type: "sc-draft", texts: nextTexts, hidden: nextHidden }, window.location.origin);
  }, []);
  useEffect(() => { pushDraft(texts, hidden); }, [texts, hidden, pushDraft]);

  /* 미리보기에서 온 신호 — 섹션 고르기·삭제·되살리기 */
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string; id?: string } | null;
      if (data?.type === "sc-ready") { pushDraft(texts, hidden); return; }
      if (!data?.id) return;
      const sectionOf = (id: string) => id.split(".")[0];
      if (data.type === "sc-select") setSelected(data.id);
      if (data.type === "sc-field") {
        setSelected(sectionOf(data.id));
        window.setTimeout(() => {
          const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-field-input="${data.id}"]`);
          el?.focus();
          el?.scrollIntoView({ block: "center" });
        }, 60);
      }
      if (data.type === "sc-hide") { setHidden((current) => current.includes(data.id!) ? current : [...current, data.id!]); setSelected(sectionOf(data.id)); }
      if (data.type === "sc-show") setHidden((current) => current.filter((id) => id !== data.id));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [texts, hidden, pushDraft]);

  /* 목록에서 고르면 미리보기가 그 섹션으로 내려간다 */
  const selectSection = (id: string) => {
    setSelected(id);
    frameRef.current?.contentWindow?.postMessage({ type: "sc-selected", id }, window.location.origin);
  };

  const login = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      await payload(await fetch("/api/admin/support/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) }));
      setSession({ authenticated: true, configured: true }); setPassword(""); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "로그인하지 못했습니다."); } finally { setBusy(false); }
  };

  const save = async () => {
    setBusy(true); setMessage("");
    try {
      const data = await payload<{ copy: SiteCopy }>(await fetch("/api/admin/site-copy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texts, hidden }),
      }));
      setTexts(data.copy.texts); setHidden(data.copy.hidden); setSaved(data.copy);
      setMessage("저장했습니다. 홈은 1분 안에 새 화면으로 바뀝니다.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "저장하지 못했습니다."); } finally { setBusy(false); }
  };

  const dirty = JSON.stringify({ texts, hidden }) !== JSON.stringify(saved);
  const revert = () => { setTexts(saved.texts); setHidden(saved.hidden); setMessage("저장 전 상태로 되돌렸습니다."); };

  if (!session) return <main className="admin-support-loading">홈페이지를 불러오는 중입니다.</main>;
  if (!session.authenticated) return (
    <main className="admin-login-page"><form onSubmit={login}><span><LockKeyhole /></span><h1>홈페이지 편집</h1><p>메인 화면을 보면서 글을 고치고 섹션을 지웁니다.</p><label><span>관리자 비밀번호</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus /></label>{message && <p className="admin-login-error">{message}</p>}<button disabled={busy || !password || !session.configured}>로그인</button><Link href="/admin">대시보드로 돌아가기</Link></form></main>
  );

  const current = EDIT_SECTIONS.find((section) => section.id === selected) ?? null;
  const currentHidden = current ? hidden.includes(current.id) : false;

  return (
    <main className="admin-home-editor">
      <header>
        <div><img src="/today-startup-logo-2026.png" alt="오늘창업" /><span><strong>메인 홈페이지</strong><small>화면에서 섹션을 골라 고치고 지웁니다 · 저장해야 반영됩니다</small></span></div>
        <nav><Link href="/admin">대시보드</Link><Link href="/admin/support">1:1 상담</Link><Link href="/admin/legal">운영 설정</Link><Link className="active" href="/admin/homepage">홈페이지</Link></nav>
      </header>

      <div className="admin-home-body">
        {/* 왼쪽 — 진짜 홈 화면. 섹션 테두리·버튼은 이 안에서 그린다 */}
        <div className="admin-home-preview">
          <div className="admin-home-mock">
            <span className="admin-home-dots" aria-hidden="true"><i /><i /><i /></span>
            <span className="admin-home-url">oneulstart.com</span>
            <Link href="/" target="_blank">실제 홈 열기 <ExternalLink size={12} /></Link>
          </div>
          <iframe ref={frameRef} src="/?copyEdit=1" title="홈 미리보기" />
        </div>

        {/* 오른쪽 — 고른 섹션의 글·숨김 */}
        <aside className="admin-home-side">
          <div className="admin-home-seclist">
            {EDIT_SECTIONS.map((section) => (
              <button
                key={section.id}
                type="button"
                className={`${selected === section.id ? "on" : ""} ${hidden.includes(section.id) ? "off" : ""}`}
                onClick={() => selectSection(section.id)}
              >
                {hidden.includes(section.id) ? <EyeOff size={13} /> : <Eye size={13} />}
                {section.label}
              </button>
            ))}
          </div>

          {current ? (
            <div className="admin-home-fields">
              <header>
                <h2>{current.label}</h2>
                {current.hideable ? (
                  <button
                    type="button"
                    className={currentHidden ? "restore" : "danger"}
                    onClick={() => setHidden((c) => currentHidden ? c.filter((id) => id !== current.id) : [...c, current.id])}
                  >
                    {currentHidden ? <><RotateCcw size={13} /> 되살리기</> : <><EyeOff size={13} /> 이 섹션 삭제</>}
                  </button>
                ) : <em>고정 섹션</em>}
              </header>
              {currentHidden ? <p className="admin-home-offnote">지금 이 섹션은 손님에게 보이지 않습니다.</p> : null}
              {fieldsForSection(current.id).map((field) => {
                const fieldOff = hidden.includes(field.id);
                return (
                  <label key={field.id} className={fieldOff ? "off" : ""}>
                    <span>
                      {field.label}
                      <button
                        type="button"
                        className={fieldOff ? "restore" : "danger"}
                        onClick={() => setHidden((c) => fieldOff ? c.filter((id) => id !== field.id) : [...c, field.id])}
                      >{fieldOff ? "되살리기" : "이 글 삭제"}</button>
                    </span>
                    {field.multiline ? (
                      <textarea data-field-input={field.id} rows={3} disabled={fieldOff} value={texts[field.id] ?? field.def} onChange={(event) => setTexts((c) => ({ ...c, [field.id]: event.target.value }))} />
                    ) : (
                      <input data-field-input={field.id} disabled={fieldOff} value={texts[field.id] ?? field.def} onChange={(event) => setTexts((c) => ({ ...c, [field.id]: event.target.value }))} />
                    )}
                    {fieldOff ? <small>지금 이 글은 화면에 나오지 않습니다.</small> : field.hint ? <small>{field.hint}</small> : null}
                  </label>
                );
              })}
              <p className="admin-home-hint">칸을 비우면 기본 문구로 돌아갑니다. 줄바꿈은 그대로 반영됩니다.</p>
            </div>
          ) : <p className="admin-home-hint">왼쪽 화면에서 섹션을 골라 주세요.</p>}

          <div className="admin-home-actions">
            {message && <p>{message}</p>}
            <div>
              {dirty ? <button type="button" onClick={revert}>변경 취소</button> : null}
              <button type="button" className="save" disabled={busy || !dirty} onClick={() => void save()}>
                <Save size={14} /> {busy ? "저장 중..." : dirty ? "저장" : "저장됨"}
              </button>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
