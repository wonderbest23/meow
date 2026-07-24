"use client";

import { ArrowRight, Building2, CheckCircle2, Clipboard, Clock3, FileCheck2, Home, LoaderCircle, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type TransferOrder = {
  orderId: string;
  amount: number;
  orderName: string;
  status: string;
  projectId: string | null;
  depositorName: string | null;
  expiresAt: string;
  confirmedAt: string | null;
  depositReportedAt: string | null;
  cashReceiptType: "PERSONAL" | "BUSINESS" | "NONE" | null;
  cashReceiptStatus: "not_requested" | "requested" | "issued";
};

type BankAccount = { bankName: string; accountNumber: string; accountHolder: string };

const statusCopy: Record<string, { title: string; body: string }> = {
  awaiting_deposit: { title: "입금을 기다리고 있어요", body: "아래 계좌로 정확한 금액을 입금한 뒤 ‘입금했어요’를 눌러주세요." },
  deposit_reported: { title: "입금 확인을 요청했어요", body: "관리자가 카카오뱅크 거래내역과 입금자명을 확인하고 있습니다." },
  done: { title: "입금 확인이 완료됐어요", body: "내 사업 프로젝트가 생성되었습니다. 지금 바로 결과물 제작을 시작할 수 있어요." },
  canceled: { title: "취소된 주문입니다", body: "입금했다면 상담창에 주문번호를 남겨주세요." },
  refunded: { title: "환불이 완료됐어요", body: "실제 계좌 반영 시점은 은행 처리 시간에 따라 달라질 수 있습니다." },
  expired: { title: "입금 기한이 지났어요", body: "홈으로 돌아가 새 주문을 만들어주세요." },
};

async function responsePayload<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? "주문을 확인하지 못했습니다.");
  return data as T;
}

function TransferStatus() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId") ?? "";
  const [order, setOrder] = useState<TransferOrder | null>(null);
  const [bank, setBank] = useState<BankAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [reporting, setReporting] = useState(false);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!orderId) throw new Error("주문번호가 없습니다.");
    const data = await responsePayload<{ order: TransferOrder; bankAccount: BankAccount }>(await fetch(`/api/payments/orders?orderId=${encodeURIComponent(orderId)}`, { cache: "no-store" }));
    setOrder(data.order); setBank(data.bankAccount); setLoading(false);
    if (data.order.status === "done" && data.order.projectId) window.localStorage.removeItem("venture-pending-order");
  }, [orderId]);

  useEffect(() => { void load().catch((error) => { setMessage(error.message); setLoading(false); }); }, [load]);
  useEffect(() => {
    if (!order || !["awaiting_deposit", "deposit_reported"].includes(order.status)) return;
    const timer = window.setInterval(() => void load().catch(() => undefined), 4000);
    return () => window.clearInterval(timer);
  }, [load, order]);

  const copyAccount = async () => {
    if (!bank) return;
    await navigator.clipboard.writeText(`${bank.bankName} ${bank.accountNumber} ${bank.accountHolder}`);
    setCopied(true); window.setTimeout(() => setCopied(false), 1800);
  };

  const report = async () => {
    if (!order || reporting) return;
    setReporting(true); setMessage("");
    try {
      await responsePayload(await fetch("/api/payments/manual", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: order.orderId }) }));
      await load(); setMessage("입금 확인 요청을 접수했습니다.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "입금 확인을 요청하지 못했습니다."); } finally { setReporting(false); }
  };

  if (loading) return <main className="manual-payment-page loading"><LoaderCircle className="spin" /><strong>주문을 확인하고 있어요</strong></main>;
  if (!order || !bank) return <main className="manual-payment-page error"><ShieldCheck /><h1>주문을 확인할 수 없어요</h1><p>{message || "로그인 상태와 주문번호를 확인해주세요."}</p><Link href="/account">로그인 확인</Link><Link href="/"><Home /> 홈으로</Link></main>;
  const copy = statusCopy[order.status] ?? statusCopy.awaiting_deposit;
  const expired = Date.parse(order.expiresAt) <= Date.now() && order.status === "awaiting_deposit";

  return <main className="manual-payment-page">
    <header><Link href="/" aria-label="오늘창업 홈"><img src="/today-startup-logo-2026.png" alt="오늘창업" /></Link><span><ShieldCheck /> 안전한 계좌이체 주문</span></header>
    <section className={`manual-payment-card status-${expired ? "expired" : order.status}`}>
      <div className="manual-payment-state">{order.status === "done" ? <CheckCircle2 /> : <Clock3 />}<span><small>{order.orderId}</small><h1>{expired ? "입금 기한이 지났어요" : copy.title}</h1><p>{expired ? statusCopy.expired.body : copy.body}</p></span></div>
      {["awaiting_deposit", "deposit_reported"].includes(order.status) && !expired && <>
        <section className="manual-bank-account"><div><Building2 /><span><small>{bank.bankName}</small><strong>{bank.accountNumber}</strong><em>예금주 {bank.accountHolder}</em></span></div><button onClick={() => void copyAccount()}><Clipboard /> {copied ? "복사했어요" : "계좌 복사"}</button></section>
        <dl><div><dt>입금 금액</dt><dd>{order.amount.toLocaleString("ko-KR")}원</dd></div><div><dt>입금자명</dt><dd>{order.depositorName}</dd></div><div><dt>입금 기한</dt><dd>{new Date(order.expiresAt).toLocaleString("ko-KR")}</dd></div></dl>
        {order.status === "awaiting_deposit" ? <button className="manual-deposit-report" disabled={reporting} onClick={() => void report()}>{reporting ? <LoaderCircle className="spin" /> : <CheckCircle2 />} 입금했어요</button> : <div className="manual-deposit-waiting"><LoaderCircle className="spin" /><span><strong>관리자가 확인하고 있어요</strong><small>화면을 닫아도 주문 상태는 저장됩니다.</small></span></div>}
      </>}
      {order.status === "done" && order.projectId && <Link className="manual-project-start" href={`/?view=project&project=${encodeURIComponent(order.projectId)}`}>내 사업 자료 확인하기 <ArrowRight /></Link>}
      <section className="manual-receipt-status"><FileCheck2 /><span><strong>현금영수증</strong><small>{order.cashReceiptStatus === "issued" ? "발급 완료" : order.cashReceiptType === "NONE" ? "구매자 번호 없이 발급 예정" : "입금 확인 후 발급 예정"}</small></span></section>
      {message && <p className="manual-payment-message" role="status">{message}</p>}
      <footer><p><strong>관리자 입금 확인 전에는 제작이 시작되지 않습니다.</strong> 확인 후 맞춤 제작이 시작되면 단순 변심 환불이 제한됩니다. 결과물 미제공·계약 불일치·중대한 하자 등 법정 권리는 보장됩니다.</p><nav><Link href="/refund">취소·환불 기준</Link><Link href="/terms">이용약관</Link><Link href="/">홈으로</Link></nav></footer>
    </section>
  </main>;
}

export default function ManualTransferPage() {
  return <Suspense fallback={<main className="manual-payment-page loading"><LoaderCircle className="spin" /><strong>주문을 불러오고 있어요</strong></main>}><TransferStatus /></Suspense>;
}
