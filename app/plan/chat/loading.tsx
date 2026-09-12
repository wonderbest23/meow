import ui from "../../../components/coach-chat-ui.module.css";
import PlanLoading from "../PlanLoading";
import BusinessAppChrome from "../BusinessAppChrome";
import styles from "./page.module.css";

export default function ChatLoading() {
  return <main className={`${ui.theme} ${styles.page}`}><BusinessAppChrome title="사업 기획" active="chat" backHref="/plan/planning"><PlanLoading fill variant="compact" note="대화를 불러오고 있어요" /></BusinessAppChrome></main>;
}
