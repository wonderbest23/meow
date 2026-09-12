import type { ReactNode } from "react";
import { ChevronRight, FileCheck2 } from "lucide-react";
import styles from "./coach-chat-ui.module.css";

export function CoachWelcome() {
  return <div className={styles.welcome} data-coach-welcome><span>생각이 사업이 되는 순간</span><h2>어떤 사업을<br />생각하고 계세요?</h2><i aria-hidden="true" /></div>;
}

export function CoachSpeaker() {
  return <span className={styles.speaker} data-coach-speaker><img src="/support-agent-avatar-2026.png" alt="" width="36" height="36" /><b>오늘창업</b><span>AI</span></span>;
}

export function CoachMessage({ role, children, className = "", label }: { role: "user" | "assistant"; children: ReactNode; className?: string; label?: string }) {
  return <article className={`${styles.message} ${role === "user" ? styles.userMessage : styles.assistantMessage} ${className}`} aria-label={label ?? (role === "user" ? "내 메시지" : "오늘창업의 답변")} data-coach-message={role}>
    {role === "assistant" && <CoachSpeaker />}{children}
  </article>;
}

export function CoachResultCard({ label, title, description, actionLabel = "내 사업안 확인하기", onOpen, className = "" }: { label: string; title: string; description?: ReactNode; actionLabel?: string; onOpen?: () => void; className?: string }) {
  const action = <><span>{actionLabel}</span><ChevronRight size={18} aria-hidden="true" /></>;
  return <section className={`${styles.resultCard} ${className}`} data-coach-result>
    <div className={styles.resultBody}><span className={styles.resultLabel}><FileCheck2 size={17} aria-hidden="true" />{label}</span><h2>{title}</h2>{description && <p>{description}</p>}</div>
    {onOpen ? <button type="button" className={styles.resultAction} onClick={onOpen}>{action}</button> : <div className={styles.resultAction} aria-hidden="true">{action}</div>}
  </section>;
}
