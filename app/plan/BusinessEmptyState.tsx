import Link from "next/link";
import { FolderOpen, MessageSquareText } from "lucide-react";
import styles from "./BusinessHub.module.css";

export default function BusinessEmptyState({ kind = "planning" }: { kind?: "planning" | "plans" | "missing" }) {
  const Icon = kind === "plans" ? FolderOpen : MessageSquareText;
  return <section className={styles.empty} data-business-empty={kind}>
    <div className={styles.emptyIcon} aria-hidden="true"><Icon size={30} strokeWidth={1.7} /></div>
    <h1>{kind === "missing" ? "이 기획을 찾지 못했어요" : kind === "plans" ? "아직 등록된 사업이 없어요" : "아직 진행 중인 기획이 없어요"}</h1>
    {/* 설명은 찾지 못한 경우에만 — 비어 있을 땐 제목과 단추면 충분하다 */}
    {kind === "missing" && <p>내 사업 목록에서 다시 고르거나 새로 시작해 주세요.</p>}
    <Link className={styles.primary} href="/plan/chat?new=1">시작하기</Link>
    {kind === "missing" && <Link className={styles.textButton} href="/plan">내 사업 목록으로</Link>}
  </section>;
}
