/*
 * 단계별 대화 세트 — 사업이 한 단계를 넘겼을 때 그 단계의 작업 화면을 열면서 함께 보여 줄 것 한 벌씩
 * (열릴 탭 + 첫 안내 말풍선 + 입력칸에 미리 넣는 문장 + 다음 할 일 버튼). 설계: docs/알림톡-단계안내-설계-2026-10-30.md 3장.
 * 0차는 알림 없이 화면 안 '다음 단계' 단추가 같은 guide= 주소를 쓴다(journeyNext · businessNextStep). 알림 발송은 1차 이후.
 * 말풍선은 고정 문구라 AI 를 부르지 않고, 대화 기록에 저장하지 않는다(화면에만). 미리 넣는 문장은 보내지 않는다 — 보내기는 사용자가 누른다.
 * 화면 코드에 기대지 않는 순수 함수만 둔다 — 테스트: scripts/journey-guides.test.ts
 */
import { businessChatHref, businessNextStep } from "./business-hub";
import { LAUNCH_SOURCES } from "./business-launch";
import { readCoach } from "./coach";
import type { Plan } from "./plan-store";
import { journeyLabel } from "./journey-steps";
import { studioHref, type StudioTab } from "./studio";

/** 주소에 싣는 이름 — 작업실이 탭을 바꿀 때 지우는 한 번용 값이다(studio.ts STUDIO_LINK_PARAMS) */
export const GUIDE_PARAM = "guide";

export const JOURNEY_GUIDE_CODES = ["design-ready", "plan-complete", "homepage-published", "registration", "launch-done", "first-lead"] as const;
export type JourneyGuideCode = typeof JOURNEY_GUIDE_CODES[number];

export function isJourneyGuideCode(value: unknown): value is JourneyGuideCode {
  return typeof value === "string" && (JOURNEY_GUIDE_CODES as readonly string[]).includes(value);
}

/** 내 문의 목록 — 대화 칸이 없어 말풍선 대신 화면 위 안내 띠 한 줄 */
export const INQUIRIES_PATH = "/plan/inquiries";

/** 사업자등록 단계의 AI 요청 문장 — business-launch.ts 의 registration 단계 prompt 와 같다 */
export const REGISTRATION_PROMPT = "현재 사업으로 관할 세무서에 물어볼 등록 상담 질문지를 작성해 주세요. 업종코드·허가 여부·신청 완료를 임의로 확정하지 마세요.";

export type JourneyGuideAction = { label: string; href: string; external?: boolean };
export type JourneyGuide = {
  code: JourneyGuideCode;
  /** 설계 문서의 단계 번호(J1~J6) */
  stage: string;
  /** 열릴 작업실 탭 — 문의 목록(J6)은 작업실 밖이라 null */
  tab: StudioTab | null;
  /** 개업 준비에서 바로 펼칠 단계(step=) */
  step?: string;
  /** 첫 안내 말풍선(J6 은 안내 띠) — 고정 문구 */
  message: string;
  /** 입력칸에 미리 넣는 문장 — 없으면 null */
  prefill: string | null;
  /** 다음 할 일 버튼 — J6 은 문의마다 전화·문자 단추가 이미 있어 두지 않는다 */
  actions: JourneyGuideAction[];
  /** 대화 칸이 없는 화면의 안내 띠 */
  banner: boolean;
};

export type JourneyGuideContext = {
  /** 운영 중인 사업 — 4단계 이름이 '운영 개선'이다(journeyLabel) */
  operating?: boolean;
  /** 개업 준비에서 다음에 할 단계 id(businessNextStep) — '첫 준비 단계 열기'가 그 단계를 바로 연다 */
  launchStep?: string | null;
};

type GuideRow = {
  stage: string;
  tab: StudioTab | null;
  step?: string;
  message: (context: JourneyGuideContext) => string;
  prefill: string | null;
  actions: (planId: string, context: JourneyGuideContext) => JourneyGuideAction[];
};

const GUIDES: Record<JourneyGuideCode, GuideRow> = {
  /* J1 사업 시작 → 사업계획서 이어가기. 계획서 작성은 결제 뒤에 한다(무료 장 없음 — free-tier.ts FREE_SECTION_COUNT = 0) */
  "design-ready": {
    stage: "J1",
    tab: "plan",
    message: () => "사업안 정리가 끝났어요 👏 이제 이 내용으로 사업계획서를 만들어요. '사업계획서 만들기'를 누르면 장마다 차례로 써 드려요. 결제 전이면 결제 화면으로 먼저 이어져요. 고치고 싶은 내용이 있으면 먼저 말씀해 주세요.",
    prefill: "사업안에서 고칠 부분이 있는지 먼저 짚어 주세요",
    /* '계획서 만들기'는 대화 칸의 '사업계획서 만들기'와 같은 일 — start=1 이면 한 번 작성을 시작하고, 결제 전이면 서버가 결제 화면으로 보낸다 */
    actions: planId => [
      { label: "계획서 만들기", href: studioHref(planId, "chat", { start: "1" }) },
      { label: "사업안 다시 보기", href: businessChatHref(planId) },
    ],
  },
  /* J2 계획서 완성 → 홈페이지 만들기 */
  "plan-complete": {
    stage: "J2",
    tab: "homepage",
    message: () => "사업계획서가 완성됐어요. 다음은 손님이 볼 홈페이지예요. 계획서 내용으로 초안을 바로 만들 수 있어요. 홈페이지 없이 개업 준비부터 하셔도 괜찮아요.",
    prefill: "홈페이지 첫 화면에 넣을 한 줄 소개를 세 가지 제안해 주세요",
    actions: (planId, context) => [
      { label: "홈페이지 초안 만들기", href: studioHref(planId, "homepage") },
      { label: `${journeyLabel("launch", context.operating)} 먼저 하기`, href: studioHref(planId, "launch") },
    ],
  },
  /* J3 홈페이지 공개 → 개업 준비 이어가기 */
  "homepage-published": {
    stage: "J3",
    tab: "launch",
    message: () => "홈페이지가 공개됐어요! 이제 실제로 문을 열 준비를 해요. 업종 신고 → 사업자등록 → 결제 방법 → 첫 홍보 순서예요. 오른쪽 목록에서 위에서부터 하나씩 하시면 돼요.",
    prefill: "제 업종은 사업자등록 전에 따로 신고해야 하는 게 있나요?",
    actions: (planId, context) => [
      { label: "첫 준비 단계 열기", href: studioHref(planId, "launch", context.launchStep ? { step: context.launchStep } : {}) },
      /* 문의 알림 번호는 홈페이지 화면의 '접수된 문의' 칸(#hk-leads)에서 정한다 */
      { label: "손님 문의 알림 받을 번호 확인", href: studioHref(planId, "homepage", {}, "hk-leads") },
    ],
  },
  /* J4 사업자등록 단계 도달 → 사업자등록 준비하기. 여기서 신청되지 않는다 — 실제 신청은 홈택스나 세무서 */
  registration: {
    stage: "J4",
    tab: "launch",
    step: "registration",
    message: () => "이제 사업자등록 차례예요. 여기서 신청이 되지는 않고, 세무서에 가져갈 사업 설명과 질문지를 함께 준비해요. 실제 신청은 홈택스나 관할 세무서에서 하시면 돼요.",
    prefill: REGISTRATION_PROMPT,
    actions: planId => [
      { label: "등록 상담 질문지 만들기", href: businessChatHref(planId, REGISTRATION_PROMPT) },
      { label: "국세청 안내 열기", href: LAUNCH_SOURCES.registration.url, external: true },
      /* 주소로는 완료 표시를 할 수 없다 — 그 단계를 열어 '완료'를 누르게 한다 */
      { label: "이미 등록했어요 · 완료 표시하기", href: studioHref(planId, "launch", { step: "registration" }) },
    ],
  },
  /* J5 개업 준비 완료 → 운영 화면 열기. 주간 리포트 켜기는 홈페이지 화면의 '접수된 문의' 칸(#hk-leads)에 있다 */
  "launch-done": {
    stage: "J5",
    tab: "operations",
    message: context => `${journeyLabel("launch", context.operating)} 목록을 모두 정리하셨어요. 이제부터는 운영이에요. 손님 문의 확인, 홈페이지 고치기, 매주 문의·방문 수 보기를 여기서 해요.`,
    prefill: "첫 한 달 동안 매주 확인할 일을 정리해 주세요",
    actions: planId => [
      { label: "주간 리포트 켜기", href: studioHref(planId, "homepage", {}, "hk-leads") },
      { label: "운영 기록 남기기", href: studioHref(planId, "launch", { step: "review" }) },
    ],
  },
  /*
   * J6 첫 손님 문의 → 문의 확인하기. '하루 안에 연락하면 계약으로 이어지기 쉬워요'는 근거가 없어 뺐다(설계 문서의 대안 문구).
   * '답장 문장 만들기'는 문의 화면에 그런 기능이 없어 두지 않는다 — 문의마다 [전화] [문자] 단추가 이미 있다.
   */
  "first-lead": {
    stage: "J6",
    tab: null,
    message: () => "첫 문의를 축하드려요! 빨리 연락할수록 좋아요.",
    prefill: null,
    actions: () => [],
  },
};

/** 그 단계의 대화 세트 */
export function journeyGuide(code: JourneyGuideCode, planId: string, context: JourneyGuideContext = {}): JourneyGuide {
  const row = GUIDES[code];
  return {
    code,
    stage: row.stage,
    tab: row.tab,
    ...(row.step ? { step: row.step } : {}),
    message: row.message(context),
    prefill: row.prefill,
    actions: row.actions(planId, context),
    banner: row.tab === null,
  };
}

/** 사업에서 읽는 문구·주소 값 — 운영 중인지, 개업 준비의 다음 단계. 사업을 아직 못 불러왔으면 빈 값(기본 문구) */
export function journeyGuideContext(plan: Plan | null | undefined): JourneyGuideContext {
  if (!plan) return {};
  return { operating: readCoach(plan.answers)?.stage === "operating", launchStep: businessNextStep(plan).step };
}

/** 그 단계 대화 세트를 여는 주소 — 작업실(탭 · 단계 · guide) 또는 내 문의 목록 */
export function journeyGuideHref(code: JourneyGuideCode, planId: string): string {
  const row = GUIDES[code];
  if (!row.tab) return `${INQUIRIES_PATH}?${GUIDE_PARAM}=${code}`;
  return studioHref(planId, row.tab, { ...(row.step ? { step: row.step } : {}), [GUIDE_PARAM]: code });
}

/** 이미 있는 주소(예전 화면 주소 포함)에 guide 를 싣는다 — 작업실로 보낼 때 그대로 따라간다(studioRedirectHref) */
export function withJourneyGuide(href: string, code: JourneyGuideCode): string {
  const at = href.indexOf("#");
  const [base, hash] = at < 0 ? [href, ""] : [href.slice(0, at), href.slice(at)];
  return `${base}${base.includes("?") ? "&" : "?"}${GUIDE_PARAM}=${code}${hash}`;
}

/** 주소의 guide 값 — 모르는 값이면 null */
export function readJourneyGuide(value: string | null | undefined): JourneyGuideCode | null {
  return isJourneyGuideCode(value) ? value : null;
}
