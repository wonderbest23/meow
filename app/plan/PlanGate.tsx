"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { KeyRound, Lock } from "lucide-react";
import styles from "./PlanGate.module.css";

export interface PlanGateProps {
  reason: "login_required" | "payment_required";
  /** 무료로 열리는 섹션 이름들 (예: "1.1 한눈에 보기") */
  freeLabels?: string[];
  /** 결제 금액 */
  price?: number;
  /** 지금 보고 있는 섹션 이름 */
  sectionTitle?: string;
}

/**
 * 로그인·결제가 필요할 때 질문 대신 보여주는 안내.
 * 실제 차단은 서버(/api/plan/generate)가 하고, 여기서는 이유와 다음 행동만 알린다.
 */
export default function PlanGate({ reason, freeLabels = [], price, sectionTitle }: PlanGateProps) {
  // 로그인 후 지금 보던 섹션으로 돌아오게 한다
  const pathname = usePathname();
  const backTo = `/account?next=${encodeURIComponent(pathname || "/plan/overview")}`;

  if (reason === "login_required") {
    return (
      <section className={styles.wrap} aria-label="로그인 필요">
        <div className={styles.icon} aria-hidden="true"><KeyRound size={26} strokeWidth={1.8} /></div>
        <h2 className={styles.title}>로그인하고 시작하세요</h2>
        <p className={styles.desc}>
          작성한 내용을 계정에 저장해 어느 기기에서든 이어서 쓸 수 있습니다.
        </p>
        <Link href={backTo} className={styles.primary}>
          로그인 · 회원가입
        </Link>
      </section>
    );
  }

  return (
    <section className={styles.wrap} aria-label="결제 필요">
      <div className={styles.icon} aria-hidden="true"><Lock size={26} strokeWidth={1.8} /></div>
      <h2 className={styles.title}>
        {sectionTitle ? `'${sectionTitle}'부터는 유료입니다` : "여기부터는 유료입니다"}
      </h2>
      <p className={styles.desc}>
        {freeLabels.length > 0 ? (
          <>
            <b>{freeLabels.join(", ")}</b>까지는 무료로 써보실 수 있습니다.
            <br />
            이어서 나머지 섹션을 작성하려면 결제가 필요합니다.
          </>
        ) : (
          <>앞부분을 무료로 써보신 뒤, 이어서 작성하려면 결제가 필요합니다.</>
        )}
      </p>
      {price ? (
        <div className={styles.price}>
          {price.toLocaleString("ko-KR")}원 <span>1회 결제 · 모든 섹션 열림</span>
        </div>
      ) : null}
      <Link href="/plan/pay" className={styles.primary}>
        결제하고 계속하기
      </Link>
      <p className={styles.note}>
        지금까지 답한 내용은 그대로 남아 있습니다. 결제 후 이 화면으로 돌아오면 이어서 작성됩니다.
      </p>
    </section>
  );
}
