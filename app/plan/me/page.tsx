"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { hydrateFromServer, lastHydrationFailed, clearLocalState, isSamplePlan, loadState, type PlanState } from "../../../lib/plan-builder/plan-store";
import { businessEntryHref, businessHubState } from "../../../lib/plan-builder/business-hub";
import { planDisplayName } from "../../../lib/plan-builder/business-name";
import type { PaymentHistoryItem } from "../../../lib/payments/plan-orders";
import { displayOrderName } from "../../../lib/payments/order-display";
import PlanGate from "../PlanGate";
import styles from "./PlanMe.module.css";
import { StatusBadge } from "../../../components/status-badge";
import PlanLoading from "../PlanLoading";
import { loadAuthSession } from "../../../lib/client/auth-session";
import { askConfirm } from "../../../components/confirm-dialog";
import { apiMessage, userErrorMessage } from "../../../lib/client/user-error";

/*
 * /plan/me — 마이페이지.
 *
 * 예전에는 레일의 계정 버튼이 /account로 나갔다. 그 화면은 옛 진단 퍼널의
 * 것이라 헤더도 흐름도 달라서 앱 밖으로 튕겨 나가는 느낌이었다.
 * 내 정보·내 사업·결제 내역을 셸 안에서 한 화면에 모은다.
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

/** 이메일 없는 계정이 탈퇴할 때 적는 확인 문구 — 서버(app/api/auth/delete)와 같은 값 */
const NO_EMAIL_CONFIRM = "탈퇴";

type RefundInfo = { orderId: string; status: "received" | "processing" | "done" | "rejected"; adminNote?: string };

const REFUND_LABEL: Record<RefundInfo["status"], string> = {
  received: "환불 접수됨",
  processing: "환불 처리 중",
  done: "환불 완료",
  rejected: "환불 거절",
};

export default function PlanMePage() {
  const router = useRouter();
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
  /** 회원 탈퇴 — 실수 방지를 위해 이메일을 다시 입력받는다 */
  const [showDelete, setShowDelete] = useState(false);
  // 탈퇴 칸을 열면 이메일 칸으로, 취소하면 '탈퇴 진행하기'로 초점을 옮긴다 — 예전엔 누른 단추가 사라져 초점이 body로 떨어졌다
  const deleteOpener = useRef<HTMLButtonElement>(null);
  const [deleteEmail, setDeleteEmail] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState("");
  /** 로그인 확인 자체가 실패함 — 로그인 안내 대신 다시 시도 안내를 보인다 */
  const [loadFailed, setLoadFailed] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [logoutMessage, setLogoutMessage] = useState("");

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

  async function deleteAccount() {
    if (deleteBusy) return;
    /* 이메일이 다르면 마지막 확인창을 띄우지 않고 바로 알린다 — 예전엔 확인창까지 간 뒤 서버에서 거절됐다 */
    if (!account) return;
    if (account.email ? deleteEmail.trim().toLowerCase() !== account.email.toLowerCase() : deleteEmail.trim() !== NO_EMAIL_CONFIRM) {
      setDeleteMessage(account.email ? "로그인한 이메일과 달라요. 위에 보이는 이메일을 그대로 적어 주세요." : `확인 칸에 '${NO_EMAIL_CONFIRM}'를 그대로 적어 주세요.`);
      return;
    }
    if (!await askConfirm({ title: "정말 탈퇴할까요?", message: "작성한 사업과 문서, 공개한 홈페이지가 모두 지워지고 되돌릴 수 없어요.", confirmLabel: "탈퇴하기", danger: true })) return;
    setDeleteBusy(true);
    setDeleteMessage("");
    try {
      const response = await fetch("/api/auth/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(account.email ? { email: deleteEmail.trim() } : { confirm: deleteEmail.trim() }),
      });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok || data === null) throw new Error(apiMessage(data, "탈퇴하지 못했어요. 잠시 후 다시 시도해 주세요."));
      clearLocalState();
      router.push("/");
      router.refresh();
    } catch (error) {
      setDeleteMessage(userErrorMessage(error, "탈퇴하지 못했어요. 잠시 후 다시 시도해 주세요."));
    } finally {
      setDeleteBusy(false);
    }
  }

  async function logout() {
    if (logoutBusy) return;
    setLogoutMessage(""); setLogoutBusy(true);
    try { await doLogout(); } finally { setLogoutBusy(false); }
  }
  async function doLogout() {
    /*
     * 서버 세션이 실제로 끊겼는지 확인한다.
     * 예전에는 응답을 보지 않고 화면만 정리했다 — 통신이 실패하면
     * 로그아웃된 것처럼 보이지만 세션은 살아 있다(공용 PC에서 위험하다).
     */
    const res = await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    if (!res || !res.ok) {
      /* 예전엔 탈퇴 칸 안에 적어서(열려 있을 때만 보임) 실패해도 아무 안내가 없었다 */
      setLogoutMessage("로그아웃하지 못했어요. 연결을 확인하고 다시 시도해 주세요.");
      return;
    }
    // 로컬 플랜 캐시도 함께 비운다 — 로그아웃 후에도 이전 계정 플랜이 보이던 버그
    clearLocalState();
    router.push("/plan");
  }

  if (account === null && loadFailed) return <div className={styles.page}><h1 className={styles.title}>내 계정</h1><p>계정 정보를 불러오지 못했어요. 연결을 확인한 뒤 새로고침해 주세요.</p></div>;
  if (account === null) return <div className={styles.page}><PlanLoading variant="rows" count={3} note="계정 정보를 불러오는 중…" /></div>;
  if (!account.authenticated) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>내 계정</h1>
        <PlanGate reason="login_required" />
      </div>
    );
  }

  /* 내 사업 — 예시 문서는 빼고, 최근에 손댄 순서로. 예전엔 옛 '사업 정보' 칸만 봐서 사업이 있어도 '없습니다'라고 했다 */
  const myPlans = (state?.plans ?? []).filter((plan) => !isSamplePlan(plan.id)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <div className={styles.page}>
      {/* 큰 제목 '마이페이지'는 위 머리말과 겹쳐 뺐다(대표 요청 2026-10-15) — 읽기 프로그램용 제목만 남긴다 */}
      <h1 className={styles.srTitle}>내 계정</h1>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>내 정보</h2>
          <button type="button" className={styles.logout} disabled={logoutBusy} onClick={() => void logout()}>{logoutBusy ? "로그아웃 중…" : "로그아웃"}</button>
        </div>
        <dl className={styles.rows}>
          <div className={styles.row}>
            <dt>이메일</dt>
            <dd>{account.email ?? "-"}</dd>
          </div>
          <div className={styles.row}>
            <dt>이용 상태</dt>
            <dd>{account.usage === "all" ? "모든 사업계획서 이용 중" : account.usage === "some" ? "결제한 사업계획서 이용 중" : account.usage === "free" ? "결제한 사업계획서 없음" : "확인하지 못했어요"}</dd>
          </div>
        </dl>
        {logoutMessage && <p className={styles.empty} role="alert">{logoutMessage}</p>}
      </section>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>내 사업</h2>
          {/* 사업이 없으면 볼 목록도 없다 — 빈 목록으로 가는 단추를 두지 않는다(PC 점검 2026-10-24) */}
          {(myPlans.length > 0 || plansStale) && <Link href="/plan" className={styles.cardAction}>내 사업 보기<ChevronRight size={18} aria-hidden="true" /></Link>}
        </div>
        {myPlans.length ? (
          <dl className={styles.rows}>
            {myPlans.slice(0, 5).map((plan) => (
              <div className={styles.row} key={plan.id}>
                <dt>{businessHubState(plan).complete ? "계획서 완성" : "진행 중"}</dt>
                <dd><Link href={businessEntryHref(plan)}>{planDisplayName(plan)}</Link></dd>
              </div>
            ))}
          </dl>
        ) : (
          plansStale ? <p className={styles.empty} role="alert">사업 목록을 불러오지 못했어요. 새로고침해 다시 확인해 주세요.</p> : <div className={styles.emptyPlans}><p className={styles.empty}>아직 시작한 사업이 없어요.</p><Link href="/plan/chat?new=1" className={`${styles.cardAction} ${styles.emptyAction}`}>새 대화로 시작하기<ChevronRight size={18} aria-hidden="true" /></Link></div>
        )}
      </section>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>결제 내역</h2>
        </div>
        {payments === null ? null : payments.length === 0 ? (
          <p className={styles.empty}>{paymentsFailed ? "결제 내역을 불러오지 못했어요. 새로고침해 주세요." : "아직 결제 내역이 없어요."}</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr><th>상품</th><th>금액</th><th>상태</th><th>일시</th><th>환불</th></tr>
              </thead>
              <tbody>
                {payments.map((item) => {
                  const refund = refunds[item.orderId];
                  return (
                  <Fragment key={item.orderId}>
                  <tr>
                    <td data-label="상품">{displayOrderName(item.orderName) || "-"}</td>
                    <td data-label="금액" className={styles.amount}>{item.amount.toLocaleString("ko-KR")}원</td>
                    <td data-label="상태">
                      <StatusBadge tone={item.status === "done" ? "success" : BAD_STATUS.has(item.status) ? "danger" : "neutral"}>
                        {STATUS_LABEL[item.status] ?? item.status}
                      </StatusBadge>
                    </td>
                    <td data-label="일시">{new Date(item.paidAt ?? item.createdAt).toLocaleDateString("ko-KR")}</td>
                    <td data-label="환불">
                      {/* 환불이 끝나면 주문은 '환불됨'으로 바뀐다 — 그래도 요청 결과는 보여 준다 */}
                      {refund ? (
                        <>
                          <StatusBadge tone={refund.status === "done" ? "success" : refund.status === "rejected" ? "danger" : "neutral"}>
                            {REFUND_LABEL[refund.status]}
                          </StatusBadge>
                          {refund.status === "rejected" && refund.adminNote ? <small style={{ display: "block", marginTop: 4, color: "var(--text-soft, #667085)" }}>사유: {refund.adminNote}</small> : null}
                        </>
                      ) : item.status === "confirming" ? (
                        <>
                          <button type="button" className={styles.refundBtn} disabled={recheckBusy === item.orderId} onClick={() => void recheck(item.orderId)}>
                            {recheckBusy === item.orderId ? "확인 중…" : "결제 다시 확인"}
                          </button>
                          {recheckMessage[item.orderId] ? <small style={{ display: "block", marginTop: 4, color: "var(--text-soft, #667085)" }}>{recheckMessage[item.orderId]}</small> : null}
                        </>
                      ) : item.status !== "done" ? (
                        <span className={styles.refundNa}>—</span>
                      ) : item.method === "APPLE_IAP" || item.method === "GOOGLE_IAP" ? (
                        /* 앱에서 결제한 주문은 스토어가 환불한다 — 여기서 접수하면 처리할 수 없다 */
                        <small style={{ color: "var(--text-soft, #667085)" }}>{item.method === "APPLE_IAP" ? "App Store에서 환불 신청" : "Google Play에서 환불 신청"}</small>
                      ) : refundsFailed ? (
                        /* 환불 상태를 못 읽었으면 '환불 요청'을 다시 보이지 않는다(이미 접수했을 수 있다) */
                        <small style={{ color: "var(--text-soft, #667085)" }}>환불 상태를 확인하지 못했어요</small>
                      ) : (
                        <button type="button" className={styles.refundBtn} onClick={() => { setRefundFor(refundFor === item.orderId ? null : item.orderId); setRefundReason(""); setRefundMessage(""); }}>
                          환불 요청
                        </button>
                      )}
                    </td>
                  </tr>
                  {refundFor === item.orderId && (
                    <tr>
                      <td colSpan={5}>
                        <div className={styles.refundForm}>
                          <textarea
                            aria-label="환불 사유"
                            rows={2}
                            value={refundReason}
                            onChange={(event) => setRefundReason(event.target.value)}
                            placeholder="환불 사유를 적어 주세요(5자 이상). 문서 작성이 시작된 뒤에는 단순 변심 환불이 제한될 수 있어요."
                            maxLength={1000}
                          />
                          <div>
                            <button type="button" className={styles.refundSubmit} disabled={refundBusy || refundReason.trim().length < 5} onClick={() => void submitRefund(item.orderId)}>
                              {refundBusy ? "접수 중…" : "환불 요청 접수"}
                            </button>
                            <button type="button" className={styles.refundCancel} onClick={() => setRefundFor(null)}>닫기</button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                  );
                })}
              </tbody>
            </table>
            {refundMessage && <p className={styles.refundMessage}>{refundMessage}</p>}
          </div>
        )}
      </section>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>회원 탈퇴</h2>
        </div>
        {!showDelete ? (
          <>
            <p className={styles.deleteNote}>
              계정과 작성한 사업·문서가 모두 지워져요. 공개한 홈페이지도 함께 지워져 그 주소로 더는 열리지 않고,
              연결한 내 도메인도 끊어져요. 결제·환불 기록은 법령상 보존 의무가 있어 사람과 연결되지 않는 형태로만 남아요.
            </p>
            <button ref={deleteOpener} type="button" className={styles.dangerBtn} onClick={() => { setShowDelete(true); setDeleteMessage(""); }}>
              탈퇴 진행하기
            </button>
          </>
        ) : (
          <div className={styles.deleteForm}>
            {/* 이메일 없는 계정(카카오 등)은 다시 적을 이메일이 없어 탈퇴할 수 없었다 — '탈퇴'를 적게 한다(감사 2026-10-23) */}
            <p id="delete-guide">
              {account.email
                ? <>되돌릴 수 없어요. 계속하려면 로그인한 이메일 <b>{account.email}</b> 을 그대로 적어 주세요.</>
                : <>되돌릴 수 없어요. 계속하려면 아래 칸에 <b>{NO_EMAIL_CONFIRM}</b> 를 그대로 적어 주세요.</>}
            </p>
            <input
              aria-label={account.email ? "탈퇴 확인용 이메일" : "탈퇴 확인 문구"}
              type={account.email ? "email" : "text"}
              autoFocus
              value={deleteEmail}
              onChange={(event) => { setDeleteEmail(event.target.value); setDeleteMessage(""); }}
              placeholder={account.email ? "이메일 입력" : NO_EMAIL_CONFIRM}
              autoComplete="off"
              aria-invalid={deleteMessage ? true : undefined}
              aria-describedby={deleteMessage ? "delete-guide delete-error" : "delete-guide"}
            />
            {deleteMessage && <p id="delete-error" className={styles.deleteError} role="alert">{deleteMessage}</p>}
            <div>
              <button
                type="button"
                className={styles.dangerBtn}
                disabled={deleteBusy || deleteEmail.trim().length < (account.email ? 5 : NO_EMAIL_CONFIRM.length)}
                onClick={() => void deleteAccount()}
              >
                {deleteBusy ? "처리 중…" : "탈퇴하기"}
              </button>
              <button type="button" className={styles.refundCancel} onClick={() => { setShowDelete(false); window.requestAnimationFrame(() => deleteOpener.current?.focus()); }}>취소</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
