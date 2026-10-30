"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Copy, Megaphone, RefreshCw } from "lucide-react";
import { fillKnownPlaceholders, MARKETING_KIT_KEY, MARKETING_KIT_LABELS, marketingKitFacts, type MarketingKit } from "../../../lib/marketing/kit";
import { businessProfile } from "../../../lib/plan-builder/business-launch";
import { loadState, pushToServer, saveAnswers, type Plan } from "../../../lib/plan-builder/plan-store";
import { openLogin } from "../../../components/login-dialog";
import styles from "./LaunchWorkspace.module.css";
import { AppButton } from "../../../components/app-button";

type Saved = { kit: MarketingKit; generatedAt: string };

function readSaved(plan: Plan): Saved | null {
  const value = plan.answers[MARKETING_KIT_KEY] as Partial<Saved> | undefined;
  return value?.kit && value.generatedAt ? value as Saved : null;
}

/*
 * 홍보 키트 — 사업 관리 '첫 홍보' 단계 안에서 소개 글·시작 안내 문자·홍보물 문구·첫 게시물·후기 요청·4주 SNS 운영표를 만든다.
 * 칸 이름은 사업 모양에 맞춘다(온라인 가게는 '스토어 소개·상세페이지 첫 문구', 매장은 '지도 소개·전단지').
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
    } catch {
      /* 연결이 끊기면 예전엔 아무 말 없이 멈췄다 */
      setMessage("연결이 끊겨 홍보 키트를 만들지 못했어요. 잠시 후 다시 눌러 주세요.");
    } finally { setBusy(false); }
  }

  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setMessage("복사했어요."); } catch { setMessage("복사하지 못했어요. 글을 선택해 복사해 주세요."); }
  }

  /* 예전에 만든 키트도 지금 아는 가격으로 [가격] 자리를 채워 보여 준다 */
  const kit = saved?.kit ? fillKnownPlaceholders(saved.kit, marketingKitFacts(plan)) : undefined;
  const labels = MARKETING_KIT_LABELS[businessProfile(plan).shape];
  const block = (title: string, value: string, shown?: ReactNode) => <section className={styles.kitBlock}><header><h3>{title}</h3><button type="button" className={styles.textLink} onClick={() => void copy(value)}><Copy size={14} aria-hidden="true" />복사</button></header>{shown ?? <p>{value}</p>}</section>;
  /* 해시태그는 하나씩 끊기지 않게 — 휴대폰에서 '#식빵 #'와 '소금빵'으로 갈라져 '#'만 줄 끝에 남았다(재검증 2026-10-22) */
  const tags = (hashtags: string[]) => hashtags.map(tag => tag.replace(/\s+/g, "")).filter(Boolean);
  const postShown = (body: string, hashtags: string[]) => <><p>{body}</p>{tags(hashtags).length > 0 && <p className={styles.kitTags}>{tags(hashtags).map((tag, index) => <span key={`${tag}-${index}`}>{tag}</span>)}</p>}</>;

  return <div className={styles.kit}>
    <div className={styles.kitHead}>
      <Megaphone size={20} aria-hidden="true" />
      <div><strong>홍보 키트 · SNS 4주 운영표</strong><p>계획서의 상품·고객·채널로 {labels.placeIntro}, {labels.openingMessage}, {labels.flyer}, 첫 게시물 3개, {labels.reviewRequest}, 4주 SNS 운영표를 한 번에 만들어요.</p></div>
    </div>
    <AppButton variant={kit ? "secondary" : "primary"} className={kit ? styles.secondary : styles.primary} disabled={busy} onClick={() => void generate()}>{busy ? "만드는 중… (1분 안팎)" : kit ? <><RefreshCw size={16} aria-hidden="true" />다시 만들기</> : "홍보 키트 만들기"}</AppButton>
    {needsPayment && <Link className={styles.textLink} href={`/plan/pay?planId=${encodeURIComponent(plan.id)}&planType=${encodeURIComponent(plan.planType)}&product=plan`}>사업계획서 결제하고 홍보 키트 열기</Link>}
    {message && <p role="status">{message}</p>}
    {kit && <>
      <small>만든 날 {new Date(saved!.generatedAt).toLocaleDateString("ko-KR")} · [가격]·[주소]처럼 대괄호는 직접 채워 주세요. 후기·실적은 넣지 않았어요.</small>
      {block(labels.placeIntro, kit.placeIntro)}
      {block(labels.openingMessage, kit.openingMessage)}
      {block(labels.flyer, `${kit.flyer.headline}\n${kit.flyer.body}\n${kit.flyer.cta}`)}
      {kit.posts.map((post, index) => <div key={index}>{block(`첫 게시물 ${index + 1} · ${post.channel}`, `${post.body}\n\n${tags(post.hashtags).join(" ")}`, postShown(post.body, post.hashtags))}</div>)}
      {block(labels.reviewRequest, kit.reviewRequest)}
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
