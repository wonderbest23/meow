import Link from "next/link";
import { FolderOpen, MessageSquareText, SquarePen } from "lucide-react";
import styles from "./BusinessHub.module.css";

export default function BusinessEmptyState({ kind = "planning" }: { kind?: "planning" | "plans" | "missing" }) {
  const Icon = kind === "plans" ? FolderOpen : MessageSquareText;
  return <section className={styles.empty} data-business-empty={kind}>
    <div className={styles.emptyIcon} aria-hidden="true"><Icon size={30} strokeWidth={1.7} /></div>
    <h1>{kind === "missing" ? "이 기획을 찾지 못했어요" : kind === "plans" ? "아직 등록된 사업이 없어요" : "아직 진행 중인 기획이 없어요"}</h1>
    <p>{kind === "missing" ? "사업 기획 목록에서 다시 선택하거나\n새 대화로 시작해 주세요." : kind === "plans" ? "새 대화로 사업을 먼저 기획해 보세요.\n정리한 사업과 자료가 이곳에 모여요." : "새 대화를 시작하면 사업 기획이 만들어져요.\n아이디어가 없어도 괜찮아요."}</p>
    <Link className={styles.primary} href="/plan/chat?new=1"><SquarePen size={18} />새 대화 시작하기</Link>
    {kind === "missing" && <Link className={styles.textButton} href="/plan/planning">사업 기획 목록으로</Link>}
  </section>;
}
