import { customerSmsConfig } from "./notify/customer-sms";
import { registrarConfig } from "./landing/registrar-config";

/*
 * 운영 설정 확인 — 기능이 조용히 꺼지는 비밀값·설정이 들어가 있는지 '있음/없음'만 본다(값은 절대 내보내지 않는다).
 * 예전엔 이메일 키가 없으면 환불·문의·도메인 알림이 로그 한 줄만 남기고 사라졌는데, 손님에게는 '접수됐어요'라고 했다.
 * 관리자 'DB 준비 상태' 화면에서 함께 보여 준다.
 */
export type ConfigCheck = {
  key: string;
  label: string;
  /** 없으면 손님에게 약속한 일이 조용히 안 되는 것 — 오픈 전에 꼭 */
  required: boolean;
  ok: boolean;
  /** 확인할 설정 이름과 주의 — 값은 넣지 않는다 */
  note: string;
};

const has = (env: Record<string, string | undefined>, ...names: string[]) => names.every(name => Boolean(env[name]?.trim()));

export function checkOpsConfig(env: Record<string, string | undefined> = process.env): ConfigCheck[] {
  const sandbox = env.NICEPAY_ENVIRONMENT?.trim() === "sandbox";
  const smsMode = env.OWNER_SMS_MODE?.trim() || "(없음)";
  const ownerSmsOn = env.OWNER_SMS_ENABLED === "1";
  return [
    { key: "ai", label: "AI(사업 기획·문서·홈페이지 글)", required: true, ok: has(env, "ANTHROPIC_API_KEY"), note: "ANTHROPIC_API_KEY" },
    {
      key: "payments", label: "카드 결제(나이스페이먼츠)", required: true,
      ok: has(env, "NICEPAY_CLIENT_KEY", "NICEPAY_SECRET_KEY") && !sandbox,
      note: sandbox ? "NICEPAY_ENVIRONMENT 가 sandbox(시험 결제)예요 — 실제 돈이 오가지 않는데 유료 기능이 열려요" : "NICEPAY_CLIENT_KEY · NICEPAY_SECRET_KEY",
    },
    {
      key: "email", label: "운영자 알림 메일(환불·1:1 문의·결제·도메인 등록)", required: true,
      ok: has(env, "RESEND_API_KEY", "NOTIFY_FROM_EMAIL"),
      note: !has(env, "RESEND_API_KEY") ? "RESEND_API_KEY 가 없어 알림 메일이 나가지 않아요(손님에게는 '접수됐어요'로 보여요)"
        : !has(env, "NOTIFY_FROM_EMAIL") ? "NOTIFY_FROM_EMAIL(보내는 주소)이 없으면 Resend 시험 주소로 보내 Resend 계정 주인에게만 도착해요"
        : `RESEND_API_KEY · NOTIFY_FROM_EMAIL · 받는 주소 OWNER_NOTIFY_EMAIL${has(env, "OWNER_NOTIFY_EMAIL") ? "" : "(없으면 기본 주소)"}`,
    },
    {
      key: "customer-sms", label: "사장님 문자(새 문의·주간 리포트·결제 완료)", required: false,
      ok: customerSmsConfig(env) !== null && smsMode !== "test",
      note: customerSmsConfig(env) === null ? "CUSTOMER_SMS_ENABLED=1 · OWNER_SMS_RELAY_URL · OWNER_SMS_RELAY_SECRET · OWNER_SMS_MODE 중 빠진 것이 있어요(문자 대신 메일로 갑니다)"
        : smsMode === "test" ? "OWNER_SMS_MODE 가 test 예요 — 실제 문자가 나가지 않는데 '보냄'으로 기록돼요"
        : `문자 모드 ${smsMode} · 중계 서버(ops/owner-sms/relay.py)를 최신으로 배포했는지는 여기서 확인할 수 없어요`,
    },
    {
      key: "owner-sms", label: "운영자 문자(1:1 문의 도착)", required: false,
      ok: ownerSmsOn && has(env, "OWNER_SMS_TO"),
      note: ownerSmsOn ? (has(env, "OWNER_SMS_TO") ? `OWNER_SMS_ENABLED=1 · 모드 ${smsMode}` : "OWNER_SMS_TO(받을 번호)가 없어요") : "OWNER_SMS_ENABLED 가 꺼져 있어요(메일로만 알려요)",
    },
    { key: "domain", label: "내 도메인 연결(Cloudflare)", required: true, ok: has(env, "CLOUDFLARE_SAAS_API_TOKEN", "CLOUDFLARE_ZONE_ID"), note: "CLOUDFLARE_SAAS_API_TOKEN · CLOUDFLARE_ZONE_ID — 없으면 도메인 연결 결제를 받지 않아요" },
    { key: "registrar", label: ".com 자동 등록(도메인 대신 사기 — 지금은 갱신만 받아요)", required: false, ok: registrarConfig(env) !== null, note: "CLOUDFLARE_REGISTRAR_TOKEN · CLOUDFLARE_REGISTRAR_ACCOUNT_ID" },
    { key: "public-data", label: "사업자등록 확인(공공데이터)", required: false, ok: has(env, "DATA_GO_KR_API_KEY") || has(env, "DATA_GO_KR_SERVICE_KEY"), note: "DATA_GO_KR_API_KEY" },
  ];
}
