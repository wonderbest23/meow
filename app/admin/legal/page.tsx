"use client";

import { CheckCircle2, ExternalLink, LockKeyhole, Save, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { defaultPlatformLegalSettings, type LaunchReadiness, type PlatformLegalSettings } from "../../../lib/platform-legal/domain";

type SessionState = { authenticated: boolean; configured: boolean };

async function payload<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? "요청을 처리하지 못했습니다.");
  return data as T;
}

const groups: Array<{ title: string; description: string; fields: Array<{ key: keyof PlatformLegalSettings; label: string; help?: string; long?: boolean }> }> = [
  {
    title: "판매자 정보",
    description: "사이트 푸터와 계약 전 거래조건에 그대로 표시됩니다.",
    fields: [
      { key: "operatorName", label: "상호 또는 운영자명" }, { key: "representativeName", label: "대표자명" },
      { key: "businessRegistrationNumber", label: "사업자등록번호" }, { key: "mailOrderSalesNumber", label: "통신판매업 신고번호" },
      { key: "businessAddress", label: "사업장 주소", long: true }, { key: "supportPhone", label: "고객 문의 전화번호" },
      { key: "supportEmail", label: "고객 문의 이메일" }, { key: "hostingProvider", label: "호스팅서비스 제공자" },
    ],
  },
  {
    title: "개인정보 책임",
    description: "개인정보 열람·삭제·처리정지 요청을 실제로 받을 연락처입니다.",
    fields: [
      { key: "privacyOfficer", label: "개인정보 보호책임자" }, { key: "privacyEmail", label: "개인정보 문의 이메일" },
      { key: "policyEffectiveDate", label: "정책 시행일", help: "예: 2026-07-14" },
      { key: "accountRetention", label: "계정 보관 기간", long: true }, { key: "projectRetention", label: "프로젝트 보관 기간", long: true },
      { key: "infrastructureRecipients", label: "기반 서비스 이전받는 자", long: true },
      { key: "infrastructureCountries", label: "Supabase·Cloudflare 처리 국가", help: "현재 Supabase 프로젝트는 싱가포르입니다. Cloudflare 계약·로그 처리 지역도 함께 확인하세요.", long: true },
      { key: "infrastructureProcessingDetails", label: "기반 서비스 처리 내용", long: true },
    ],
  },
  {
    title: "OpenAI 국외 처리",
    description: "OpenAI 조직의 실제 데이터 지역 설정과 하위처리자 목록을 확인한 뒤 입력하세요.",
    fields: [
      { key: "overseasRecipient", label: "이전받는 자", long: true },
      { key: "overseasCountries", label: "실제 처리 국가", help: "계정의 데이터 지역과 OpenAI 하위처리자 목록을 확인해 작성", long: true },
      { key: "overseasTransferredData", label: "전송되는 정보", long: true }, { key: "overseasPurpose", label: "처리 목적", long: true },
      { key: "overseasTimingAndMethod", label: "전송 시기와 방법", long: true }, { key: "overseasRetention", label: "보관 기준", long: true },
      { key: "overseasRefusalImpact", label: "거부 방법과 영향", long: true },
    ],
  },
  {
    title: "제공·환불 기준",
    description: "결제 전에 소비자가 확인하는 실제 계약 조건입니다.",
    fields: [
      { key: "serviceSupplyTiming", label: "서비스 제공 시기", long: true },
      { key: "refundBeforeSupply", label: "제공 시작 전 환불", long: true },
      { key: "refundAfterSupply", label: "제공 시작 후 환불", long: true },
    ],
  },
];

export default function AdminLegalPage() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [password, setPassword] = useState("");
  const [settings, setSettings] = useState<PlatformLegalSettings>(defaultPlatformLegalSettings);
  const [readiness, setReadiness] = useState<LaunchReadiness | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = async () => {
    const data = await payload<{ settings: PlatformLegalSettings; readiness: LaunchReadiness }>(await fetch("/api/admin/legal", { cache: "no-store" }));
    setSettings(data.settings); setReadiness(data.readiness);
  };

  useEffect(() => {
    void fetch("/api/admin/support/session", { cache: "no-store" })
      .then((response) => payload<SessionState>(response))
      .then((state) => { setSession(state); if (state.authenticated) void load().catch((error) => setMessage(error.message)); })
      .catch((error) => setMessage(error.message));
  }, []);

  const missingText = useMemo(() => readiness?.missing.join(" · ") ?? "", [readiness]);

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
      const data = await payload<{ settings: PlatformLegalSettings; readiness: LaunchReadiness }>(await fetch("/api/admin/legal", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) }));
      setSettings(data.settings); setReadiness(data.readiness); setMessage("운영 정보와 공개 문서를 저장했습니다.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "저장하지 못했습니다."); } finally { setBusy(false); }
  };

  if (!session) return <main className="admin-support-loading">운영 설정을 불러오는 중입니다.</main>;
  if (!session.authenticated) return (
    <main className="admin-login-page"><form onSubmit={login}><span><LockKeyhole /></span><h1>운영 설정</h1><p>사업자 정보, 개인정보와 환불 기준을 관리합니다.</p><label><span>관리자 비밀번호</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus /></label>{message && <p className="admin-login-error">{message}</p>}<button disabled={busy || !password || !session.configured}>로그인</button><Link href="/admin">상담 관리로 돌아가기</Link></form></main>
  );

  return (
    <main className="admin-legal-page">
      <header><div><img src="/today-startup-logo.png" alt="오늘창업" /><span><strong>정식 출시 운영 설정</strong><small>판매자 정보와 공개 정책</small></span></div><nav><Link href="/admin">1:1 문의</Link><Link className="active" href="/admin/legal">운영 설정</Link></nav></header>
      <div className={`admin-readiness ${readiness?.ready ? "ready" : "blocked"}`}>
        {readiness?.ready ? <CheckCircle2 /> : <ShieldAlert />}
        <div><strong>{readiness?.ready ? "법적 고지 기본값이 모두 확인되었습니다." : "유료 출시가 잠겨 있습니다."}</strong><p>{readiness?.ready ? "결제사 설정까지 완료하면 유료 판매를 열 수 있습니다." : missingText}</p></div>
      </div>
      <form onSubmit={save}>
        {groups.map((group) => <section key={group.title}><header><h2>{group.title}</h2><p>{group.description}</p></header><div>{group.fields.map((field) => <label className={field.long ? "wide" : ""} key={field.key}><span>{field.label}</span>{field.long ? <textarea rows={3} value={String(settings[field.key])} onChange={(event) => setSettings((current) => ({ ...current, [field.key]: event.target.value }))} /> : <input value={String(settings[field.key])} onChange={(event) => setSettings((current) => ({ ...current, [field.key]: event.target.value }))} />}{field.help && <small>{field.help}</small>}</label>)}</div></section>)}
        <section className="admin-legal-confirm"><header><h2>최종 확인</h2><p>실제 운영값과 일치하는지 직접 확인한 뒤 체크하세요.</p></header><label><input type="checkbox" checked={settings.infrastructureRegionConfirmed} onChange={(event) => setSettings((current) => ({ ...current, infrastructureRegionConfirmed: event.target.checked }))} /><span><strong>Supabase·Cloudflare 처리 지역을 확인했습니다.</strong><small>현재 연결된 Supabase 프로젝트는 싱가포르 리전입니다.</small></span></label><label><input type="checkbox" checked={settings.openAiRegionConfirmed} onChange={(event) => setSettings((current) => ({ ...current, openAiRegionConfirmed: event.target.checked }))} /><span><strong>OpenAI 처리 지역을 확인했습니다.</strong><small><a href="https://openai.com/policies/sub-processor-list/" target="_blank" rel="noreferrer">OpenAI 하위처리자 목록 <ExternalLink /></a></small></span></label><label><input type="checkbox" checked={settings.authEmailDeliveryConfirmed} onChange={(event) => setSettings((current) => ({ ...current, authEmailDeliveryConfirmed: event.target.checked }))} /><span><strong>가입 확인·비밀번호 복구 메일을 실제로 받아봤습니다.</strong><small>운영용 SMTP를 연결한 뒤 외부 이메일 주소로 가입과 복구를 각각 시험하세요.</small></span></label><label><input type="checkbox" checked={settings.legalReviewConfirmed} onChange={(event) => setSettings((current) => ({ ...current, legalReviewConfirmed: event.target.checked }))} /><span><strong>대표자·거래조건·개인정보 문구가 실제 운영과 일치합니다.</strong><small>자동 초안은 실제 사실 확인을 대신하지 않습니다.</small></span></label></section>
        <div className="admin-legal-actions"><div>{message && <p>{message}</p>}<span><Link href="/privacy" target="_blank">공개 문서 미리보기 <ExternalLink /></Link></span></div><button type="submit" disabled={busy}><Save /> {busy ? "저장 중..." : "운영 설정 저장"}</button></div>
      </form>
    </main>
  );
}
