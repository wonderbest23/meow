"use client";

import BusinessAppChrome from "../BusinessAppChrome";
import PlanLoading from "../PlanLoading";
import frame from "../chat/page.module.css";
import styles from "./Studio.module.css";

/** 작업실 로딩 — 머리줄(뒤로·메뉴)은 그대로 두고 본문 자리에 작은 로딩. 라우트 로딩과 주소 확인 중에 같이 쓴다 */
export default function StudioLoading() {
  return <main className={`${frame.page} ${styles.page}`}>
    <BusinessAppChrome title="사업 작업실" showRail={false} backHref="/plan" active="plans">
      <PlanLoading fill variant="compact" note="작업실을 불러오고 있어요" />
    </BusinessAppChrome>
  </main>;
}
