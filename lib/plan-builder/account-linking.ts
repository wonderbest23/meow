import { hashIdentityToken } from "../identity-tokens";

export const planAccountLinkingEnabled = () => process.env.PLAN_ACCOUNT_LINKING_ENABLED === "true";

/** A cache boundary, not an authentication credential. Ownership still comes from server cookies. */
export const planOwnerKey = (ownerHash: string) => hashIdentityToken(`plan-cache:${ownerHash}`);

export function accountLinkError(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (code === "PLAN_CLAIM_BUSY") return { code, message: "진행 중인 대화 또는 문서 작업이 있어요. 작업이 끝난 뒤 다시 로그인해 주세요. 작성한 내용은 그대로 보관되어 있어요.", status: 409 };
  if (["PLAN_CLAIM_FAILED", "PLAN_VERSION_CONFLICT"].includes(code)) return { code: "PLAN_CLAIM_FAILED", message: "작성한 사업을 계정에 연결하지 못했어요. 기존 내용은 보관되어 있으니 잠시 후 다시 로그인해 주세요.", status: 503 };
  return null;
}
