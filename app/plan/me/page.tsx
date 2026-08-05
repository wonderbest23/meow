"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { hydrateFromServer, type PlanState } from "../../../lib/plan-builder/plan-store";
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
  confirming: "승인 중",
  done: "결제 완료",
  canceled: "취소됨",
  partial_canceled: "부분 취소",
  aborted: "중단됨",
  expired: "기한 만료",
  failed: "실패",
};

const BAD_STATUS = new Set(["canceled", "partial_canceled", "aborted", "expired", "failed"]);

export default function PlanMePage() {
  const router = useRouter();
  const [account, setAccount] = useState<{ authenticated: boolean; email: string | null; paid: boolean } | null>(null);
  const [payments, setPayments] = useState<PaymentHistoryItem[] | null>(null);
  const [state, setState] = useState<PlanState | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/plan/access")
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setAccount({ authenticated: !!d.authenticated, email: d.email ?? null, paid: !!d.paid });
        if (!d.authenticated) return;
        void fetch("/api/auth/payments", { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : { payments: [] }))
          .then((data: { payments?: PaymentHistoryItem[] }) => alive && setPayments(data.payments ?? []))
          .catch(() => alive && setPayments([]));
      })
      .catch(() => alive && setAccount({ authenticated: false, email: null, paid: false }));
    void hydrateFromServer().then((s) => alive && setState(s));
    return () => {
      alive = false;
    };
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/plan");
  }

  if (account === null) return <div className={styles.page}><PlanLoading variant="rows" count={3} note="계정 정보를 불러오는 중…" /></div>;
  if (!account.authenticated) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>마이페이지</h1>
        <PlanGate reason="login_required" />
      </div>
    );
  }

  const biz = state?.business;
  const planCount = state?.plans.length ?? 0;

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>마이페이지</h1>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>내 정보</h2>
          <button type="button" className={styles.logout} onClick={logout}>로그아웃</button>
        </div>
        <dl className={styles.rows}>
          <div className={styles.row}>
            <dt>이메일</dt>
            <dd>{account.email ?? "-"}</dd>
          </div>
          <div className={styles.row}>
            <dt>이용 상태</dt>
            <dd>{account.paid ? "전체 섹션 이용 중" : "무료 구간 이용 중"}</dd>
          </div>
          <div className={styles.row}>
            <dt>만든 플랜</dt>
            <dd>{planCount}개</dd>
          </div>
        </dl>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>내 사업</h2>
          <Link href="/plan/start" className={styles.cardAction}>사업 정보 수정</Link>
        </div>
        {biz?.name ? (
          <dl className={styles.rows}>
            <div className={styles.row}><dt>사업명</dt><dd>{biz.name}</dd></div>
            {biz.industry ? <div className={styles.row}><dt>업종</dt><dd>{biz.industry}</dd></div> : null}
            {biz.region ? <div className={styles.row}><dt>지역</dt><dd>{biz.region}</dd></div> : null}
            {biz.stage ? <div className={styles.row}><dt>진행 단계</dt><dd>{biz.stage}</dd></div> : null}
            {biz.role ? <div className={styles.row}><dt>역할</dt><dd>{biz.role}</dd></div> : null}
            {biz.description ? <div className={styles.row}><dt>소개</dt><dd>{biz.description}</dd></div> : null}
          </dl>
        ) : (
          <p className={styles.empty}>아직 등록한 사업이 없습니다.</p>
        )}
      </section>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>결제 내역</h2>
        </div>
        {payments === null ? null : payments.length === 0 ? (
          <p className={styles.empty}>아직 결제 내역이 없습니다.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr><th>상품</th><th>금액</th><th>상태</th><th>일시</th></tr>
              </thead>
              <tbody>
                {payments.map((item) => (
                  <tr key={item.orderId}>
                    <td>{item.orderName || "-"}</td>
                    <td className={styles.amount}>{item.amount.toLocaleString("ko-KR")}원</td>
                    <td>
                      <span className={`${styles.status} ${item.status === "done" ? styles.statusDone : BAD_STATUS.has(item.status) ? styles.statusBad : ""}`}>
                        {STATUS_LABEL[item.status] ?? item.status}
                      </span>
                    </td>
                    <td>{new Date(item.paidAt ?? item.createdAt).toLocaleDateString("ko-KR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
