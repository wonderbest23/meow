import { notFound } from "next/navigation";
import { ArrowUp, Paperclip } from "lucide-react";
import { CoachMessage, CoachResultCard, CoachSpeaker } from "../../../components/coach-chat-ui";
import ui from "../../../components/coach-chat-ui.module.css";
import theme from "../../../components/workspace-theme.module.css";
import styles from "../../plan/chat/page.module.css";
import BusinessAppChrome from "../../plan/BusinessAppChrome";

export default async function ChatUiPreview({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { state } = await searchParams;
  return <div className={`plan-ui ${theme.theme}`} data-chat-ui-preview><style>{"body:has([data-chat-ui-preview]) .support-chat-widget { display: none; }"}</style><main className={`${styles.page} ${styles.liveChat} ${ui.theme}`}>
    <BusinessAppChrome title="채팅 디자인 검증 · 예시 데이터" active="chat">
      <div className={styles.workspace}><section className={styles.chatPane} aria-label="사업 기획 대화">
        <div className={styles.conversation}><div className={styles.thread}>
          <CoachMessage role="user" className={styles.user}><p>사진 찍는 걸 좋아해요. 주 5시간, 100만원으로 시작할 수 있을까요?</p></CoachMessage>
          {state === "thinking" ? <div className={styles.thinking} role="status"><CoachSpeaker /><div className={styles.thinkingLine}><p>상품과 운영 방법을 정리하고 있어요</p><div className={ui.typingDots} aria-hidden="true"><i /><i /><i /></div></div></div> : <>
            <CoachMessage role="assistant" className={styles.assistant}><p>좋아하는 일에서 시작해 볼게요.<br />동네 가게의 메뉴 사진을 만드는 작은 사업은 어떨까요?</p></CoachMessage>
            <CoachResultCard className={styles.readyNotice} label="함께 정리한 사업안" title="동네 가게 메뉴 사진 제작" description="고객 · 상품 · 비용 · 시작 방법" />
          </>}
        </div></div>
        <footer className={styles.composer}><form className={ui.composerShell}>
          <button type="button" className={styles.tool} aria-label="기존 문서 첨부" disabled><Paperclip size={20} /></button><textarea aria-label="사업에 대해 말씀해주세요" placeholder="메시지를 입력하세요" readOnly rows={1} /><button type="button" className={`${styles.send} ${ui.sendButton}`} aria-label="보내기" disabled><ArrowUp size={22} /></button>
        </form></footer>
      </section></div>
    </BusinessAppChrome>
  </main></div>;
}
