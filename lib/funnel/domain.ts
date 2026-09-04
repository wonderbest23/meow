import { z } from "zod";

/*
 * 챗봇 → 결제 깔때기 이벤트.
 *
 * 상담 위젯의 CTA 는 여러 번 손봤지만 효과를 잰 적이 없다. 여기 정의한
 * 이벤트만 받는다 — 이름을 자유 문자열로 두면 표가 금방 쓰레기장이 된다.
 *
 *  consult_cta_view     상담 창에 계획서 CTA 가 보였다 (variant: soft | main)
 *  consult_cta_click    그 CTA 를 눌렀다 (variant: soft | main | pick | welcome | limit_plan)
 *  consult_limit_view   하루 상담 한도 안내가 보였다 (needsLogin)
 *  consult_login_click  한도 안내에서 로그인을 눌렀다
 *  consult_handoff_arrive  상담 값을 들고 /plan/start 에 실제로 도착했다 (filled: 항목 수)
 *  support_link_click   문의 답변에 붙은 화면 링크를 눌렀다 (href, source: faq | ai)
 */
export const funnelEventNames = [
  "consult_cta_view",
  "consult_cta_click",
  "consult_limit_view",
  "consult_login_click",
  "consult_handoff_human",
  "consult_handoff_arrive",
  "support_link_click",
] as const;

export type FunnelEventName = (typeof funnelEventNames)[number];

/* 부가 정보는 짧은 원시값만 — 자유 텍스트(상담 내용)가 섞여 들어오면 안 된다 */
export const funnelEventSchema = z.object({
  event: z.enum(funnelEventNames),
  meta: z
    .record(z.string().max(40), z.union([z.string().max(160), z.number(), z.boolean()]))
    .refine((value) => Object.keys(value).length <= 8, "meta 항목이 너무 많습니다.")
    .default({}),
});

export type FunnelEvent = z.infer<typeof funnelEventSchema>;
