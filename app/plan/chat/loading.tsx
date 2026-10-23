"use client";

import { useSyncExternalStore } from "react";
import ui from "../../../components/coach-chat-ui.module.css";
import PlanLoading from "../PlanLoading";
import BusinessAppChrome from "../BusinessAppChrome";
import styles from "./page.module.css";
import { useStudioPane } from "../studio/StudioContext";

/* 새 대화(?new=1)를 여는 중이면 제목·선택 메뉴도 '새 대화'로 — 로딩이 끝날 때 제목이 바뀌며 깜빡이지 않게 */
const noop = () => () => {};
const readNew = () => new URLSearchParams(window.location.search).get("new") === "1";

export default function ChatLoading() {
  const isNew = useSyncExternalStore(noop, readNew, () => false);
  /* 작업실 왼쪽 대화 칸 안 — 자기 main·머리줄을 그리지 않고(작업실 루트가 하나뿐인 main), 칸 안에 작은 로딩만 둔다 */
  const pane = useStudioPane();
  if (pane) return <PlanLoading variant="compact" note="대화를 불러오고 있어요" />;
  return <main className={`${ui.theme} ${styles.page}`}><BusinessAppChrome title={isNew ? "새 대화" : "사업 기획"} active={isNew ? "new" : "chat"} backHref="/plan"><PlanLoading fill variant="compact" note="대화를 불러오고 있어요" /></BusinessAppChrome></main>;
}
