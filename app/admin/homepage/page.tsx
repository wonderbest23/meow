"use client";

import { ExternalLink, LockKeyhole, Save } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { HIDEABLE_SECTIONS, SITE_COPY_FIELDS, type SiteCopy } from "../../../lib/site-copy/domain";

/*
 * 어드민 — 메인 홈페이지 문구 편집.
 *
 * 코드의 기본 문구가 원본이고, 여기서 저장한 값이 덮어쓴다. 칸을 비우면
 * 기본 문구로 돌아간다. 섹션 숨김을 체크하면 홈에서 그 섹션이 통째로 빠진다.
 * 화면 구조·인증 흐름은 운영 설정(/admin/legal)과 같다.
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
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = async () => {
    const data = await payload<{ copy: SiteCopy }>(await fetch("/api/admin/site-copy", { cache: "no-store" }));
    setTexts(data.copy.texts);
    setHidden(data.copy.hidden);
  };

  useEffect(() => {
    void fetch("/api/admin/support/session", { cache: "no-store" })
      .then((response) => payload<SessionState>(response))
      .then((state) => { setSession(state); if (state.authenticated) void load().catch((error) => setMessage(error.message)); })
      .catch((error) => setMessage(error instanceof Error ? error.message : "세션을 확인하지 못했습니다."));
  }, []);

  const groups = useMemo(() => {
    const order: string[] = [];
    const byGroup = new Map<string, typeof SITE_COPY_FIELDS>();
    for (const field of SITE_COPY_FIELDS) {
      if (!byGroup.has(field.group)) { byGroup.set(field.group, []); order.push(field.group); }
      byGroup.get(field.group)!.push(field);
    }
    return order.map((group) => ({ group, fields: byGroup.get(group)! }));
  }, []);

  const login = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      await payload(await fetch("/api/admin/support/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) }));
      setSession({ authenticated: true, configured: true }); setPassword(""); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "로그인하지 못했습니다."); } finally { setBusy(false); }
  };

  const save = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const data = await payload<{ copy: SiteCopy }>(await fetch("/api/admin/site-copy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texts, hidden }),
      }));
      setTexts(data.copy.texts); setHidden(data.copy.hidden);
      setMessage("저장했습니다. 홈은 1분 안에 새 문구로 바뀝니다.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "저장하지 못했습니다."); } finally { setBusy(false); }
  };

  if (!session) return <main className="admin-support-loading">홈페이지 문구를 불러오는 중입니다.</main>;
  if (!session.authenticated) return (
    <main className="admin-login-page"><form onSubmit={login}><span><LockKeyhole /></span><h1>홈페이지 문구</h1><p>메인 화면의 글을 고치고 섹션을 숨깁니다.</p><label><span>관리자 비밀번호</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus /></label>{message && <p className="admin-login-error">{message}</p>}<button disabled={busy || !password || !session.configured}>로그인</button><Link href="/admin">대시보드로 돌아가기</Link></form></main>
  );

  return (
    <main className="admin-legal-page">
      <header>
        <div><img src="/today-startup-logo-2026.png" alt="오늘창업" /><span><strong>메인 홈페이지 문구</strong><small>비우면 기본 문구로 돌아갑니다 · 줄바꿈은 그대로 반영</small></span></div>
        <nav><Link href="/admin">대시보드</Link><Link href="/admin/support">1:1 상담</Link><Link href="/admin/legal">운영 설정</Link><Link className="active" href="/admin/homepage">홈 문구</Link></nav>
      </header>
      <form onSubmit={save}>
        <section>
          <header><h2>섹션 숨기기</h2><p>체크한 섹션은 홈에서 통째로 빠집니다. 언제든 다시 켤 수 있습니다.</p></header>
          <div className="admin-home-hide">
            {HIDEABLE_SECTIONS.map((section) => (
              <label key={section.id}>
                <input
                  type="checkbox"
                  checked={hidden.includes(section.id)}
                  onChange={(event) => setHidden((current) => event.target.checked ? [...current, section.id] : current.filter((id) => id !== section.id))}
                />
                <span>{section.label}</span>
              </label>
            ))}
          </div>
        </section>
        {groups.map(({ group, fields }) => (
          <section key={group}>
            <header><h2>{group}</h2></header>
            <div>
              {fields.map((field) => (
                <label className="wide" key={field.id}>
                  <span>{field.label}</span>
                  {field.multiline ? (
                    <textarea rows={3} value={texts[field.id] ?? field.def} onChange={(event) => setTexts((current) => ({ ...current, [field.id]: event.target.value }))} />
                  ) : (
                    <input value={texts[field.id] ?? field.def} onChange={(event) => setTexts((current) => ({ ...current, [field.id]: event.target.value }))} />
                  )}
                  {field.hint && <small>{field.hint}</small>}
                </label>
              ))}
            </div>
          </section>
        ))}
        <div className="admin-legal-actions">
          <div>{message && <p>{message}</p>}<span><Link href="/" target="_blank">홈 미리보기 <ExternalLink /></Link></span></div>
          <button type="submit" disabled={busy}><Save /> {busy ? "저장 중..." : "홈 문구 저장"}</button>
        </div>
      </form>
    </main>
  );
}
