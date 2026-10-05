"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { hydrateFromServer, clearLocalState, isSamplePlan, loadState, type PlanState } from "../../../lib/plan-builder/plan-store";
import { businessEntryHref, businessHubState } from "../../../lib/plan-builder/business-hub";
import type { PaymentHistoryItem } from "../../../lib/payments/plan-orders";
import PlanGate from "../PlanGate";
import styles from "./PlanMe.module.css";
import PlanLoading from "../PlanLoading";

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

type RefundInfo = { orderId: string; status: "received" | "done" | "rejected" };

const REFUND_LABEL: Record<RefundInfo["status"], string> = {
  received: "환불 접수됨",
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
  /** orderId → 환불 요청 상태 */
  const [refunds, setRefunds] = useState<Record<string, RefundInfo>>({});
  /** 환불 사유 입력을 연 주문 */
  const [refundFor, setRefundFor] = useState<string | null>(null);
  const [refundReason, setRefundReason] = useState("");
  const [refundBusy, setRefundBusy] = useState(false);
  const [refundMessage, setRefundMessage] = useState("");
  /** 회원 탈퇴 — 실수 방지를 위해 이메일을 다시 입력받는다 */
  const [showDelete, setShowDelete] = useState(false);
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
      fetch("/api/auth/session", { cache: "no-store" }).then((r) => { if (!r.ok) throw new Error("session unavailable"); return r.json() as Promise<{ authenticated?: boolean; email?: string | null }>; }),
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
          .then((r) => (r.ok ? r.json() : { requests: [] }))
          .then((data: { requests?: RefundInfo[] }) => {
            if (!alive) return;
            const map: Record<string, RefundInfo> = {};
            for (const item of data.requests ?? []) map[item.orderId] = item;
            setRefunds(map);
          })
          .catch(() => undefined);
      })
      .catch(() => alive && setLoadFailed(true));
    void hydrateFromServer().catch(() => loadState()).then((s) => alive && setState(s));
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
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? "환불 요청을 접수하지 못했습니다.");
      setRefunds((current) => ({ ...current, [orderId]: { orderId, status: "received" } }));
      setRefundFor(null);
      setRefundReason("");
      setRefundMessage("환불 요청이 접수됐습니다. 처리 결과는 이 화면과 이메일로 안내됩니다.");
    } catch (error) {
      setRefundMessage(error instanceof Error ? error.message : "환불 요청을 접수하지 못했습니다.");
    } finally {
      setRefundBusy(false);
    }
  }

  async function deleteAccount() {
    if (deleteBusy) return;
    if (!window.confirm("정말 탈퇴하시겠어요?\n작성한 사업과 문서가 모두 삭제되며 되돌릴 수 없습니다.")) return;
    setDeleteBusy(true);
    setDeleteMessage("");
    try {
      const response = await fetch("/api/auth/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: deleteEmail.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? "탈퇴 처리에 실패했습니다.");
      clearLocalState();
      router.push("/");
      router.refresh();
    } catch (error) {
      setDeleteMessage(error instanceof Error ? error.message : "탈퇴 처리에 실패했습니다.");
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
      setLogoutMessage("로그아웃하지 못했습니다. 연결을 확인하고 다시 시도해주세요.");
      return;
    }
    // 로컬 플랜 캐시도 함께 비운다 — 로그아웃 후에도 이전 계정 플랜이 보이던 버그
    clearLocalState();
    router.push("/plan");
  }

  if (account === null && loadFailed) return <div className={styles.page}><h1 className={styles.title}>마이페이지</h1><p>계정 정보를 불러오지 못했어요. 연결을 확인한 뒤 새로고침해 주세요.</p></div>;
  if (account === null) return <div className={styles.page}><PlanLoading variant="rows" count={3} note="계정 정보를 불러오는 중…" /></div>;
  if (!account.authenticated) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>마이페이지</h1>
        <PlanGate reason="login_required" />
      </div>
    );
  }

  /* 내 사업 — 예시 문서는 빼고, 최근에 손댄 순서로. 예전엔 옛 '사업 정보' 칸만 봐서 사업이 있어도 '없습니다'라고 했다 */
  const myPlans = (state?.plans ?? []).filter((plan) => !isSamplePlan(plan.id)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>마이페이지</h1>

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
            <dd>{account.usage === "all" ? "모든 사업계획서 이용 중" : account.usage === "some" ? "결제한 사업계획서 이용 중" : account.usage === "free" ? "무료로 이용 중" : "확인하지 못했어요"}</dd>
          </div>
          <div className={styles.row}>
            <dt>내 사업</dt>
            <dd>{myPlans.length}개</dd>
          </div>
        </dl>
        {logoutMessage && <p className={styles.empty} role="alert">{logoutMessage}</p>}
      </section>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>내 사업</h2>
          <Link href="/plan" className={styles.cardAction}>내 사업 보기</Link>
        </div>
        {myPlans.length ? (
          <dl className={styles.rows}>
            {myPlans.slice(0, 5).map((plan) => (
              <div className={styles.row} key={plan.id}>
                <dt>{businessHubState(plan).complete ? "계획서 완성" : "진행 중"}</dt>
                <dd><Link href={businessEntryHref(plan)}>{plan.title || "이름 없는 사업"}</Link></dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className={styles.empty}>아직 시작한 사업이 없습니다. <Link href="/plan/chat?new=1">새 대화로 시작하기</Link></p>
        )}
      </section>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>결제 내역</h2>
        </div>
        {payments === null ? null : payments.length === 0 ? (
          <p className={styles.empty}>{paymentsFailed ? "결제 내역을 불러오지 못했어요. 새로고침해 주세요." : "아직 결제 내역이 없습니다."}</p>
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
                    <td data-label="상품">{item.orderName || "-"}</td>
                    <td data-label="금액" className={styles.amount}>{item.amount.toLocaleString("ko-KR")}원</td>
                    <td data-label="상태">
                      <span className={`${styles.status} ${item.status === "done" ? styles.statusDone : BAD_STATUS.has(item.status) ? styles.statusBad : ""}`}>
                        {STATUS_LABEL[item.status] ?? item.status}
                      </span>
                    </td>
                    <td data-label="일시">{new Date(item.paidAt ?? item.createdAt).toLocaleDateString("ko-KR")}</td>
                    <td data-label="환불">
                      {item.status !== "done" ? (
                        <span className={styles.refundNa}>—</span>
                      ) : refund ? (
                        <span className={`${styles.status} ${refund.status === "done" ? styles.statusDone : refund.status === "rejected" ? styles.statusBad : ""}`}>
                          {REFUND_LABEL[refund.status]}
                        </span>
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
                            placeholder="환불 사유를 적어주세요 (5자 이상). 문서 생성 시작 후 단순 변심 환불은 제한될 수 있습니다."
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
            <p className={styles.empty}>
              계정과 작성한 사업·문서가 모두 삭제됩니다. 결제·환불 기록은 법령상 보존 의무가 있어
              사람과 연결되지 않는 형태로만 남습니다.
            </p>
            <button type="button" className={styles.dangerBtn} onClick={() => { setShowDelete(true); setDeleteMessage(""); }}>
              탈퇴 진행하기
            </button>
          </>
        ) : (
          <div className={styles.deleteForm}>
            <p>
              되돌릴 수 없습니다. 계속하려면 로그인한 이메일 <b>{account.email}</b>을(를) 입력해 주세요.
            </p>
            <input
              aria-label="탈퇴 확인용 이메일"
              type="email"
              value={deleteEmail}
              onChange={(event) => setDeleteEmail(event.target.value)}
              placeholder="이메일 입력"
              autoComplete="off"
            />
            {deleteMessage && <p className={styles.deleteError}>{deleteMessage}</p>}
            <div>
              <button
                type="button"
                className={styles.dangerBtn}
                disabled={deleteBusy || deleteEmail.trim().length < 5}
                onClick={() => void deleteAccount()}
              >
                {deleteBusy ? "처리 중…" : "탈퇴하기"}
              </button>
              <button type="button" className={styles.refundCancel} onClick={() => setShowDelete(false)}>취소</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
