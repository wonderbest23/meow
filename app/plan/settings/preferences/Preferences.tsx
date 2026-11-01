"use client";

import { useEffect, useState } from "react";
import { AppButton } from "../../../../components/app-button";
import { SettingsCard, SettingsHeader, SettingsRow, SettingsSection, SettingsToggle } from "../../../../components/settings-row";
import { SUPPORT_BADGE_KEY } from "../../../../components/support-chat-visibility";
import { hydrateFromServer, isSamplePlan, lastHydrationFailed, loadState, type Plan } from "../../../../lib/plan-builder/plan-store";
import { planDisplayName } from "../../../../lib/plan-builder/business-name";
import { homepageHref } from "../../../../lib/plan-builder/journey";
import styles from "../settings.module.css";

/*
 * 환경설정 — 지금 있는 설정만 둔다(없는 설정을 만들지 않는다).
 * 1) 상담 단추의 새 답변 숫자 — 상담 창 '설정' 탭과 같은 값(이 기기에 저장, SUPPORT_BADGE_KEY). 상담 단추는 다음에 열 때부터 따른다.
 * 2) 문의 알림 번호 — 홈페이지로 들어온 손님 문의를 문자로 받을 번호. 사업마다 홈페이지 화면의 '알림 번호'(#hk-leads)에서 정한다 — 그 칸으로 보낸다.
 * 시안에 있던 'AI가 먼저 묻지 않고 할 일 · 말투 · 기본 지역 · 대화 제안 · 카카오 알림'은 지금 없는 설정이라 넣지 않았다.
 */
export default function Preferences() {
  const [badge, setBadge] = useState(true);
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [stale, setStale] = useState(false);
  useEffect(() => { try { setBadge(window.localStorage.getItem(SUPPORT_BADGE_KEY) !== "0"); } catch { /* 저장소를 못 쓰면 켬 */ } }, []);
  useEffect(() => {
    let alive = true;
    /* 읽기만 한다 — 이 기기에만 있는 변경을 서버로 올리는 건 사업 화면이 맡는다 */
    void hydrateFromServer(false).catch(() => loadState()).then(state => {
      if (!alive) return;
      setPlans(state.plans.filter(plan => !isSamplePlan(plan.id)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
      setStale(lastHydrationFailed());
    });
    return () => { alive = false; };
  }, []);
  const changeBadge = (value: boolean) => { setBadge(value); try { window.localStorage.setItem(SUPPORT_BADGE_KEY, value ? "1" : "0"); } catch { /* 이 창에서만 적용 */ } };
  return <div className={styles.page}>
    <SettingsHeader title="환경설정" description="알림을 나에게 맞게 바꿔요." mobile="band" />
    <SettingsSection id="pref-alerts" title="알림" description="상담 단추와 손님 문의 알림이에요.">
      <SettingsCard mobile="band">
        <SettingsRow inline title="상담 단추 새 답변 숫자" descriptionId="pref-badge-desc" description="상담 단추에 읽지 않은 답변 수를 띄워요. 이 기기에만 저장돼요."
          control={<SettingsToggle checked={badge} onChange={changeBadge} label="상담 단추 새 답변 숫자" describedBy="pref-badge-desc" />} />
        {plans === null ? <SettingsRow title="문의 알림 번호" description="사업 목록을 불러오는 중…" />
          : plans.length === 0 ? <SettingsRow title="문의 알림 번호" description={stale ? "사업 목록을 불러오지 못했어요. 새로고침해 다시 확인해 주세요." : "사업을 시작하고 홈페이지를 만들면, 손님 문의를 문자로 받을 번호를 정할 수 있어요."} />
          : plans.map(plan => <SettingsRow key={plan.id} title={plans.length > 1 ? `문의 알림 번호 · ${planDisplayName(plan)}` : "문의 알림 번호"}
            description="홈페이지로 손님 문의가 오면 문자로 알려 줄 번호예요. 그 사업의 홈페이지 화면에서 정해요."
            control={<AppButton href={`${homepageHref(plan.id)}#hk-leads`} variant="soft" size="adaptive" aria-label={`${planDisplayName(plan)} 문의 알림 번호 설정`}>설정</AppButton>} />)}
      </SettingsCard>
    </SettingsSection>
  </div>;
}
