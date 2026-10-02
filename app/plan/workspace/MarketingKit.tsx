"use client";

import { useState } from "react";
import Link from "next/link";
import { Copy, Megaphone, RefreshCw } from "lucide-react";
import { MARKETING_KIT_KEY, type MarketingKit } from "../../../lib/marketing/kit";
import { loadState, pushToServer, saveAnswers, type Plan } from "../../../lib/plan-builder/plan-store";
import { openLogin } from "../../../components/login-dialog";
import styles from "./LaunchWorkspace.module.css";

type Saved = { kit: MarketingKit; generatedAt: string };

function readSaved(plan: Plan): Saved | null {
  const value = plan.answers[MARKETING_KIT_KEY] as Partial<Saved> | undefined;
  return value?.kit && value.generatedAt ? value as Saved : null;
}

/*
 * 홍보 키트 — 사업 관리 '첫 홍보' 단계 안에서 지도 소개·시작 안내 문자·전단지·첫 게시물·리뷰 요청·4주 SNS 운영표를 만든다.
 * 만든 글은 이 사업 기록에 저장되고, 그대로 복사해 쓸 수 있다.
 */
export default function MarketingKitPanel({ plan, onSaved }: { plan: Plan; onSaved: (plan: Plan) => void }) {
  const [saved, setSaved] = useState<Saved | null>(() => readSaved(plan));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [needsPayment, setNeedsPayment] = useState(false);

  async function generate() {
    if (busy) return;
    setBusy(true); setMessage(""); setNeedsPayment(false);
    try {
      const response = await fetch("/api/plan/marketing-kit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId: plan.id }) });
      const data = await response.json().catch(() => null) as { kit?: MarketingKit; generatedAt?: string; error?: { code?: string; message?: string } } | null;
      if (response.status === 401) { openLogin(); return; }
      if (response.status === 402) { setNeedsPayment(true); setMessage(data?.error?.message ?? "결제한 사업에서 만들 수 있어요."); return; }
      if (!response.ok || !data?.kit || !data.generatedAt) { setMessage(data?.error?.message ?? "홍보 키트를 만들지 못했어요. 잠시 후 다시 시도해 주세요."); return; }
      const next = { kit: data.kit, generatedAt: data.generatedAt };
      if (!saveAnswers(MARKETING_KIT_KEY, next as unknown as Record<string, unknown>, plan.id)) { setMessage("만든 글을 저장하지 못했어요. 사업을 다시 열어 주세요."); return; }
      setSaved(next);
      const latest = loadState().plans.find(item => item.id === plan.id); if (latest) onSaved(latest);
      setMessage(await pushToServer() ? "홍보 키트를 만들어 저장했어요." : "이 기기에 저장했어요. 서버 저장은 연결을 확인한 뒤 다시 시도해 주세요.");
    } finally { setBusy(false); }
  }

  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setMessage("복사했어요."); } catch { setMessage("복사하지 못했어요. 글을 선택해 복사해 주세요."); }
  }

  const kit = saved?.kit;
  const block = (title: string, value: string) => <section className={styles.kitBlock}><header><h3>{title}</h3><button type="button" className={styles.textLink} onClick={() => void copy(value)}><Copy size={14} aria-hidden="true" />복사</button></header><p>{value}</p></section>;

  return <div className={styles.kit}>
    <div className={styles.kitHead}>
      <Megaphone size={20} aria-hidden="true" />
      <div><strong>홍보 키트 · SNS 4주 운영표</strong><p>계획서의 상품·고객·채널로 지도 소개, 시작 안내 문자, 전단지 문구, 첫 게시물 3개, 리뷰 요청 문구, 4주 SNS 운영표를 한 번에 만들어요.</p></div>
    </div>
    <button type="button" className={kit ? styles.secondary : styles.primary} disabled={busy} onClick={() => void generate()}>{busy ? "만드는 중… (1분 안팎)" : kit ? <><RefreshCw size={16} aria-hidden="true" />다시 만들기</> : "홍보 키트 만들기"}</button>
    {needsPayment && <Link className={styles.textLink} href={`/plan/pay?planId=${encodeURIComponent(plan.id)}&planType=${encodeURIComponent(plan.planType)}`}>결제하고 홍보 키트 열기</Link>}
    {message && <p role="status">{message}</p>}
    {kit && <>
      <small>만든 날 {new Date(saved!.generatedAt).toLocaleDateString("ko-KR")} · [가격]·[주소]처럼 대괄호는 직접 채워 주세요. 후기·실적은 넣지 않았어요.</small>
      {block("지도·플레이스 소개", kit.placeIntro)}
      {block("시작 안내 문자", kit.openingMessage)}
      {block("전단지·배너", `${kit.flyer.headline}\n${kit.flyer.body}\n${kit.flyer.cta}`)}
      {kit.posts.map((post, index) => <div key={index}>{block(`첫 게시물 ${index + 1} · ${post.channel}`, `${post.body}\n\n${post.hashtags.join(" ")}`)}</div>)}
      {block("리뷰 요청 문구", kit.reviewRequest)}
      <section className={styles.kitBlock}>
        <header><h3>SNS 4주 운영표</h3><button type="button" className={styles.textLink} onClick={() => void copy(kit.calendar.map(week => `${week.week}주차 · ${week.theme}\n${week.posts.map(post => `- ${post.day} (${post.format}) ${post.idea}\n  ${post.caption}`).join("\n")}`).join("\n\n"))}><Copy size={14} aria-hidden="true" />전체 복사</button></header>
        {kit.calendar.map(week => <details key={week.week} className={styles.kitWeek} open={week.week === 1}>
          <summary>{week.week}주차 · {week.theme}</summary>
          <ol>{week.posts.map((post, index) => <li key={index}><strong>{post.day} · {post.format}</strong><span>{post.idea}</span><p>{post.caption}</p><button type="button" className={styles.textLink} onClick={() => void copy(post.caption)}><Copy size={14} aria-hidden="true" />글 복사</button></li>)}</ol>
        </details>)}
      </section>
    </>}
  </div>;
}
