"use client";

import { Fragment, useEffect, useState } from "react";
import { ChevronRight, Copy, FolderOpen, Receipt } from "lucide-react";
import { hydrateFromServer, lastHydrationFailed, isSamplePlan, loadState, type PlanState } from "../../../lib/plan-builder/plan-store";
import { businessEntryHref, businessHubState } from "../../../lib/plan-builder/business-hub";
import { planDisplayName } from "../../../lib/plan-builder/business-name";
import type { PaymentHistoryItem } from "../../../lib/payments/plan-orders";
import { displayOrderName } from "../../../lib/payments/order-display";
import PlanGate from "../PlanGate";
import styles from "./PlanMe.module.css";
import { StatusBadge, type StatusTone } from "../../../components/status-badge";
import PlanLoading from "../PlanLoading";
import { EmptyState } from "../BusinessEmptyState";
import { loadAuthSession } from "../../../lib/client/auth-session";
import { apiMessage, userErrorMessage } from "../../../lib/client/user-error";
import { AppButton } from "../../../components/app-button";
import { TextArea } from "../../../components/app-field";
import { SettingsAvatar, SettingsCard, SettingsHeader, SettingsHelpLink, SettingsRow, SettingsSection } from "../../../components/settings-row";
import { PLAN_VIEW_ALL } from "../MobileTabBar";
import { DeleteAccountRow, LogoutRow } from "./AccountActions";

/*
 * /plan/me — 마이페이지.
 *
 * 예전에는 레일의 계정 버튼이 /account로 나갔다. 그 화면은 옛 진단 퍼널의
 * 것이라 헤더도 흐름도 달라서 앱 밖으로 튕겨 나가는 느낌이었다.
 * 내 정보·내 사업·결제 내역을 셸 안에서 한 화면에 모은다.
 * lovable 구조 3단계 — 설정 행 카드(components/settings-row)로: 로그인 정보 → 내 사업 → 결제 내역 → 계정 정리.
 * 로그인 수단(카카오·애플) 표시·연결은 지금 서버가 알려 주지 않아(/api/auth/session 은 이메일만) 행을 두지 않는다 — 시안 문서에 적음.
 */

const STATUS_LABEL: Record<string, string> = {
  created: "결제 대기",
  awaiting_deposit: "입금 대기",
  deposit_reported: "입금 확인 중",
  refunded: "환불됨",
  confirming: "승인 중",
  done: "결제 완료",
  canceled: "취소됨",
  partial_canceled: "부분 취소",
  aborted: "중단됨",
  expired: "기한 만료",
  failed: "실패",
};

const BAD_STATUS = new Set(["canceled", "partial_canceled", "aborted", "expired", "failed"]);

/* 이용 상태 — 문서마다 결제하는 사람도 있다(모든 문서 / 결제한 문서 있음 / 없음 / 확인 못 함) */
const USAGE: Record<"all" | "some" | "free" | "unknown", { label: string; description: string; tone: StatusTone }> = {
  all: { label: "모든 사업계획서 이용 중", description: "결제한 사업계획서는 모두 열어 볼 수 있어요.", tone: "success" },
  some: { label: "결제한 사업계획서 이용 중", description: "결제한 사업계획서를 열어 볼 수 있어요.", tone: "success" },
  free: { label: "결제한 사업계획서 없음", description: "사업계획서는 결제한 뒤에 쓸 수 있어요.", tone: "neutral" },
  unknown: { label: "확인하지 못했어요", description: "잠시 뒤 새로고침하면 다시 확인해요.", tone: "warning" },
};

type RefundInfo = { orderId: string; status: "received" | "processing" | "done" | "rejected"; adminNote?: string };

const REFUND_LABEL: Record<RefundInfo["status"], string> = {
  received: "환불 접수됨",
  processing: "환불 처리 중",
  done: "환불 완료",
  rejected: "환불 거절",
};

export default function PlanMePage() {
  /* usage — 모든 문서 / 결제한 문서 있음 / 무료 / 확인 못 함 */
  const [account, setAccount] = useState<{ authenticated: boolean; email: string | null; usage: "all" | "some" | "free" | "unknown" } | null>(null);
  /** 결제 내역을 불러오지 못함 — '결제 내역 없음'으로 보이지 않게 */
  const [paymentsFailed, setPaymentsFailed] = useState(false);
  const [payments, setPayments] = useState<PaymentHistoryItem[] | null>(null);
  const [state, setState] = useState<PlanState | null>(null);
  /* 서버 목록을 못 불러와 이 기기 저장본만 보이는지 — 그때 0개를 '사업 없음'이라고 하지 않는다 */
  const [plansStale, setPlansStale] = useState(false);
  /** orderId → 환불 요청 상태 */
  const [refunds, setRefunds] = useState<Record<string, RefundInfo>>({});
  const [refundsFailed, setRefundsFailed] = useState(false);
  /** 환불 사유 입력을 연 주문 */
  const [refundFor, setRefundFor] = useState<string | null>(null);
  const [refundReason, setRefundReason] = useState("");
  const [refundBusy, setRefundBusy] = useState(false);
  const [refundMessage, setRefundMessage] = useState("");
  /* 승인 응답을 놓쳐 '승인 중'에 멈춘 카드 결제 — 결과 화면을 닫았어도 여기서 다시 확인한다 */
  const [recheckBusy, setRecheckBusy] = useState<string | null>(null);
  const [recheckMessage, setRecheckMessage] = useState<Record<string, string>>({});
  const recheck = async (orderId: string) => {
    setRecheckBusy(orderId);
    try {
      const response = await fetch("/api/payments/plan/reconcile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId }) });
      const data = await response.json().catch(() => ({})) as { status?: string; reason?: string };
      if (data.status === "ok") {
        setPayments((current) => current?.map((item) => item.orderId === orderId ? { ...item, status: "done" } : item) ?? current);
        setRecheckMessage((current) => ({ ...current, [orderId]: "결제가 확인됐어요. 이제 바로 쓸 수 있어요." }));
      } else {
        setRecheckMessage((current) => ({ ...current, [orderId]: data.status === "fail" ? (data.reason ?? "완료되지 않은 결제예요.") : "아직 카드사 확인 중이에요. 잠시 뒤 다시 눌러 주세요. 다시 결제하지는 마세요." }));
      }
    } catch {
      setRecheckMessage((current) => ({ ...current, [orderId]: "확인하지 못했어요. 잠시 뒤 다시 눌러 주세요." }));
    } finally { setRecheckBusy(null); }
  };
  /** 로그인 확인 자체가 실패함 — 로그인 안내 대신 다시 시도 안내를 보인다 */
  const [loadFailed, setLoadFailed] = useState(false);
  /** 이메일 복사 결과 — 읽기 프로그램에도 알린다 */
  const [copied, setCopied] = useState("");

  useEffect(() => {
    let alive = true;
    /*
     * 로그인 여부는 로그인 전용 주소(/api/auth/session)로 정한다 — 왼쪽 메뉴와 같은 곳.
     * 결제 정보(/api/plan/access)는 이용 상태 표시에만 쓰고, 그게 실패해도 로그인 안내로 바꾸지 않는다.
     */
    Promise.all([
      loadAuthSession(),
      fetch("/api/plan/access", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null) as Promise<{ allAccess?: boolean; hasAnyPaid?: boolean; unavailable?: boolean } | null>,
    ])
      .then(([session, access]) => {
        if (!alive) return;
        const authenticated = !!session.authenticated;
        /* 문서마다 결제하는 사람도 있다 — 예전엔 '전체 이용권(paid)'만 봐서 결제한 사람에게도 '무료 구간'이라고 했다 */
        const usage = !access || access.unavailable ? "unknown" : access.allAccess ? "all" : access.hasAnyPaid ? "some" : "free";
        setAccount({ authenticated, email: session.email ?? null, usage });
        if (!authenticated) return;
        void fetch("/api/auth/payments", { cache: "no-store" })
          .then((r) => { if (!r.ok) throw new Error("payments unavailable"); return r.json(); })
          .then((data: { payments?: PaymentHistoryItem[] }) => alive && setPayments(data.payments ?? []))
          .catch(() => { if (alive) { setPayments([]); setPaymentsFailed(true); } });
        void fetch("/api/plan/refund", { cache: "no-store" })
          .then((r) => { if (!r.ok) throw new Error("refunds unavailable"); return r.json(); })
          .then((data: { requests?: RefundInfo[] }) => {
            if (!alive) return;
            const map: Record<string, RefundInfo> = {};
            for (const item of data.requests ?? []) map[item.orderId] = item;
            // 그사이 이 화면에서 접수한 요청은 남긴다(늦게 온 목록이 지우지 않게)
            setRefunds((current) => ({ ...current, ...map }));
            setRefundsFailed(false);
          })
          .catch(() => { if (alive) setRefundsFailed(true); });
      })
      .catch(() => alive && setLoadFailed(true));
    void hydrateFromServer().catch(() => loadState()).then((s) => { if (!alive) return; setState(s); setPlansStale(lastHydrationFailed()); });
    return () => {
      alive = false;
    };
  }, []);

  async function submitRefund(orderId: string) {
    const reason = refundReason.trim();
    if (reason.length < 5 || refundBusy) return;
    setRefundBusy(true);
    setRefundMessage("");
    try {
      const response = await fetch("/api/plan/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, reason }),
      });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok || data === null) throw new Error(apiMessage(data, "환불 요청을 접수하지 못했어요. 잠시 후 다시 시도해 주세요."));
      setRefunds((current) => ({ ...current, [orderId]: { orderId, status: "received" } }));
      setRefundFor(null);
      setRefundReason("");
      setRefundMessage("환불 요청이 접수됐어요. 처리 결과는 이 화면에서 확인할 수 있어요.");
    } catch (error) {
      setRefundMessage(userErrorMessage(error, "환불 요청을 접수하지 못했어요. 잠시 후 다시 시도해 주세요."));
    } finally {
      setRefundBusy(false);
    }
  }

  const header = <SettingsHeader title="내 계정" description="로그인 정보와 사업, 결제 내역을 한곳에서 봐요." mobile="hidden" aside={<SettingsHelpLink href="/account/support">도움말</SettingsHelpLink>} />;
  if (account === null && loadFailed) return <div className={styles.page}>{header}<p className={styles.notice} role="alert">계정 정보를 불러오지 못했어요. 연결을 확인한 뒤 새로고침해 주세요.</p></div>;
  if (account === null) return <div className={styles.page}>{header}<PlanLoading variant="rows" count={3} note="계정 정보를 불러오는 중…" /></div>;
  if (!account.authenticated) {
    return (
      <div className={styles.page}>
        {header}
        <PlanGate reason="login_required" />
      </div>
    );
  }

  /* 내 사업 — 예시 문서는 빼고, 최근에 손댄 순서로. 예전엔 옛 '사업 정보' 칸만 봐서 사업이 있어도 '없습니다'라고 했다 */
  const myPlans = (state?.plans ?? []).filter((plan) => !isSamplePlan(plan.id)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const usage = USAGE[account.usage];
  const copyEmail = async (email: string) => {
    try { await navigator.clipboard.writeText(email); setCopied("이메일을 복사했어요."); }
    catch { setCopied("복사하지 못했어요. 길게 눌러 직접 복사해 주세요."); }
  };

  return (
    <div className={styles.page}>
      {header}

      <SettingsSection id="me-info" title="로그인 정보" description="어떤 계정으로 들어와 있는지, 이용 상태는 어떤지 보여요.">
        <SettingsCard>
          <SettingsRow title="이메일" description={account.email ? <><span className={styles.pcOnly}>로그인에 쓰는 주소예요. 안내 메일도 여기로 가요.</span><span className={styles.phoneOnly}>{account.email}</span></> : "이메일 없이 로그인한 계정이에요."}
            control={account.email ? <>
              <span className={styles.mono}>{account.email}</span>
              <AppButton type="button" variant="text" size="compact" className={styles.copy} aria-label="이메일 복사" title="이메일 복사" onClick={() => void copyEmail(account.email ?? "")}><Copy size={16} strokeWidth={1.8} aria-hidden="true" /></AppButton>
            </> : <span className={styles.mono}>-</span>}>
            {copied && <p className={styles.rowNotice} role="status">{copied}</p>}
          </SettingsRow>
          <SettingsRow title="이용 상태" description={usage.description} control={<StatusBadge tone={usage.tone} done={account.usage === "all"}>{usage.label}</StatusBadge>} />
          <LogoutRow />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection id="me-business" title="내 사업" description={myPlans.length ? `사업 ${myPlans.length}개` : undefined}
        /* 사업이 없으면 볼 목록도 없다 — 빈 목록으로 가는 단추를 두지 않는다(PC 점검 2026-10-24) */
        aside={(myPlans.length > 0 || plansStale) && <AppButton href={`/plan?view=${PLAN_VIEW_ALL}`} variant="secondary" size="compact" className={styles.cardAction}>전체 보기<ChevronRight size={14} aria-hidden="true" /></AppButton>}>
        <SettingsCard>
          {myPlans.length ? myPlans.slice(0, 5).map((plan) => {
            const complete = businessHubState(plan).complete;
            const name = planDisplayName(plan);
            return <SettingsRow key={plan.id} leading={<SettingsAvatar tone="soft">{name.trim().charAt(0) || "사"}</SettingsAvatar>}
              title={planDisplayName(plan)} description={`${complete ? "계획서 완성" : "진행 중"} · ${new Date(plan.updatedAt).toLocaleDateString("ko-KR", { month: "long", day: "numeric" })} 수정`}
              control={<>
                <StatusBadge tone={complete ? "success" : "info"} done={complete}>{complete ? "계획서 완성" : "진행 중"}</StatusBadge>
                <AppButton href={businessEntryHref(plan)} variant="soft" size="compact" className={styles.open} aria-label={`${name} 열기`}>열기</AppButton>
              </>} />;
          }) : (
            plansStale ? <p className={styles.notice} role="alert">사업 목록을 불러오지 못했어요. 새로고침해 다시 확인해 주세요.</p> : <EmptyState icon={FolderOpen} heading="p" title="아직 시작한 사업이 없어요." actions={<AppButton href="/plan/chat?new=1" variant="secondary">새 대화로 시작하기<ChevronRight size={18} aria-hidden="true" /></AppButton>} />
          )}
        </SettingsCard>
      </SettingsSection>

      <SettingsSection id="me-payments" title="결제 내역" description="사업계획서·홈페이지 결제와 환불 상태예요.">
        <SettingsCard>
          {payments === null ? <PlanLoading variant="compact" note="결제 내역을 불러오는 중…" /> : payments.length === 0 ? (
            paymentsFailed ? <p className={styles.notice} role="alert">결제 내역을 불러오지 못했어요. 새로고침해 주세요.</p> : <EmptyState icon={Receipt} heading="p" title="아직 결제 내역이 없어요." />
          ) : payments.map((item) => {
            const refund = refunds[item.orderId];
            return (
              <Fragment key={item.orderId}>
                <SettingsRow title={displayOrderName(item.orderName) || "-"}
                  description={`${item.amount.toLocaleString("ko-KR")}원 · ${new Date(item.paidAt ?? item.createdAt).toLocaleDateString("ko-KR")}`}
                  control={<>
                    <StatusBadge tone={item.status === "done" ? "success" : BAD_STATUS.has(item.status) ? "danger" : "neutral"}>
                      {STATUS_LABEL[item.status] ?? item.status}
                    </StatusBadge>
                    {/* 환불이 끝나면 주문은 '환불됨'으로 바뀐다 — 그래도 요청 결과는 보여 준다 */}
                    {refund ? (
                      <StatusBadge tone={refund.status === "done" ? "success" : refund.status === "rejected" ? "danger" : "neutral"}>
                        {REFUND_LABEL[refund.status]}
                      </StatusBadge>
                    ) : item.status === "confirming" ? (
                      <AppButton type="button" variant="soft" size="compact" className={styles.refundBtn} disabled={recheckBusy === item.orderId} onClick={() => void recheck(item.orderId)}>
                        {recheckBusy === item.orderId ? "확인 중…" : "결제 다시 확인"}
                      </AppButton>
                    ) : item.status !== "done" ? null : item.method === "APPLE_IAP" || item.method === "GOOGLE_IAP" ? (
                      /* 앱에서 결제한 주문은 스토어가 환불한다 — 여기서 접수하면 처리할 수 없다 */
                      <small className={styles.rowHint}>{item.method === "APPLE_IAP" ? "App Store에서 환불 신청" : "Google Play에서 환불 신청"}</small>
                    ) : refundsFailed ? (
                      /* 환불 상태를 못 읽었으면 '환불 요청'을 다시 보이지 않는다(이미 접수했을 수 있다) */
                      <small className={styles.rowHint}>환불 상태를 확인하지 못했어요</small>
                    ) : (
                      <AppButton type="button" variant="secondary" size="compact" className={styles.refundBtn} aria-expanded={refundFor === item.orderId} onClick={() => { setRefundFor(refundFor === item.orderId ? null : item.orderId); setRefundReason(""); setRefundMessage(""); }}>
                        환불 요청
                      </AppButton>
                    )}
                  </>}>
                  {refund?.status === "rejected" && refund.adminNote ? <p className={styles.rowNotice}>사유: {refund.adminNote}</p> : null}
                  {recheckMessage[item.orderId] ? <p className={styles.rowNotice} role="status">{recheckMessage[item.orderId]}</p> : null}
                </SettingsRow>
                {refundFor === item.orderId && (
                  <SettingsRow stack title="환불 사유" description="5자 이상 적어 주세요. 문서 작성이 시작된 뒤에는 단순 변심 환불이 제한될 수 있어요.">
                    <div className={styles.refundForm}>
                      <TextArea
                        aria-label="환불 사유"
                        rows={3}
                        value={refundReason}
                        onChange={(event) => setRefundReason(event.target.value)}
                        placeholder="환불 사유를 적어 주세요(5자 이상). 문서 작성이 시작된 뒤에는 단순 변심 환불이 제한될 수 있어요."
                        maxLength={1000}
                      />
                      <div className={styles.refundActions}>
                        <AppButton type="button" variant="soft" size="compact" className={styles.refundCancel} onClick={() => setRefundFor(null)}>닫기</AppButton>
                        <AppButton type="button" variant="primary" size="compact" className={styles.refundSubmit} disabled={refundBusy || refundReason.trim().length < 5} onClick={() => void submitRefund(item.orderId)}>
                          {refundBusy ? "접수 중…" : "환불 요청 접수"}
                        </AppButton>
                      </div>
                    </div>
                  </SettingsRow>
                )}
              </Fragment>
            );
          })}
        </SettingsCard>
        {refundMessage && <p className={styles.refundMessage} role="status">{refundMessage}</p>}
      </SettingsSection>

      <SettingsSection id="me-danger" title="계정 정리" description="되돌릴 수 없는 일이라 따로 모아 두었어요.">
        <SettingsCard>
          <DeleteAccountRow email={account.email} />
        </SettingsCard>
      </SettingsSection>
    </div>
  );
}
