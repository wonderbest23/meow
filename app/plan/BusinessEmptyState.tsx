import Link from "next/link";
import { FolderOpen, LogIn, MessageSquareText } from "lucide-react";
import styles from "./BusinessHub.module.css";
import { MISSING_BUSINESS_DETAIL, MISSING_BUSINESS_TITLE } from "../../lib/plan-builder/missing-business";

export default function BusinessEmptyState({ kind = "planning" }: { kind?: "planning" | "plans" | "missing" | "loggedOut" }) {
  /*
   * 로그인하지 않았으면(또는 로그인이 풀렸으면) '사업이 없어요'라고 하지 않는다 — 사업이 지워진 줄 알았다.
   * 로그인부터 안내하고, 처음이면 바로 시작할 수 있게 둔다.
   */
  if (kind === "loggedOut") return <section className={styles.empty} data-business-empty={kind}>
    <div className={styles.emptyIcon} aria-hidden="true"><LogIn size={30} strokeWidth={1.7} /></div>
    <h1>로그인하면 내 사업이 보여요</h1>
    <p>만들어 둔 사업계획서와 홈페이지는 계정에 저장돼 있어요.</p>
    <Link className={styles.primary} href="/account?next=%2Fplan">로그인</Link>
    <Link className={styles.textButton} href="/plan/chat?new=1">처음이면 바로 시작하기</Link>
  </section>;
  const Icon = kind === "plans" ? FolderOpen : MessageSquareText;
  return <section className={styles.empty} data-business-empty={kind}>
    <div className={styles.emptyIcon} aria-hidden="true"><Icon size={30} strokeWidth={1.7} /></div>
    <h1>{kind === "missing" ? MISSING_BUSINESS_TITLE : kind === "plans" ? "아직 등록된 사업이 없어요" : "아직 진행 중인 기획이 없어요"}</h1>
    {/* 설명은 찾지 못한 경우에만 — 비어 있을 땐 제목과 단추면 충분하다 */}
    {kind === "missing" && <p>{MISSING_BUSINESS_DETAIL}</p>}
    <Link className={styles.primary} href="/plan/chat?new=1">시작하기</Link>
    {kind === "missing" && <Link className={styles.textButton} href="/plan">내 사업 목록으로</Link>}
  </section>;
}
