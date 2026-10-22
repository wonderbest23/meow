import type { LandingDraft, LandingSiteRecord } from "./domain";
import { LANDING_CONFLICT_MESSAGE, type LandingSaveRequest } from "./save-contract";
import { koreanText } from "../client/user-error";
import { loadAuthSession } from "../client/auth-session";

/** 로그인이 풀려 저장하지 못했을 때의 오류 코드·문구 — 화면은 이 코드를 보고 '다시 로그인' 단추를 붙인다 */
export const LANDING_LOGIN_REQUIRED = "LOGIN_REQUIRED";
export const LANDING_LOGIN_MESSAGE = "로그인이 풀렸어요. 다시 로그인하면 이어서 할 수 있어요. 고친 내용은 이 화면에 남아 있어요.";

/** 지금 로그인돼 있는지 — 확인하지 못하면 로그인돼 있다고 본다(로그인 안내를 잘못 띄우지 않게) */
async function signedIn(): Promise<boolean> {
  try { return (await loadAuthSession()).authenticated !== false; } catch { return true; }
}

export class LandingSaveError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

export async function persistLandingDraft(
  projectId: string,
  draft: LandingDraft,
  expectedUpdatedAt: string | null,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<LandingSiteRecord> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) abort();
  const timeout = setTimeout(abort, options.timeoutMs ?? 30_000);
  try {
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/landing`, {
      method: "PUT",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft, expectedUpdatedAt } satisfies LandingSaveRequest),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 409) throw new LandingSaveError(payload?.error?.code ?? "LANDING_DRAFT_CONFLICT", LANDING_CONFLICT_MESSAGE);
      /*
       * 로그인이 풀리면 서버는 이 홈페이지를 다른 사람(손님) 것으로 보고 401 또는 404 를 준다.
       * 예전엔 '홈페이지를 찾을 수 없습니다'만 떠 사장님은 홈페이지가 지워진 줄 알았다 — 로그인 상태를 확인해 다시 로그인하는 길로 안내한다.
       * (권한 판단은 그대로 서버가 한다. 여기서는 안내 문구만 고른다)
       */
      if (response.status === 401 || response.status === 404 && !(await signedIn())) throw new LandingSaveError(LANDING_LOGIN_REQUIRED, LANDING_LOGIN_MESSAGE);
      if (response.status === 404) throw new LandingSaveError(payload?.error?.code ?? "PROJECT_NOT_FOUND", "이 홈페이지를 찾지 못했어요. 다른 화면에서 지웠거나 다른 계정으로 바뀌었을 수 있어요. 수정 내용은 이 화면에 남아 있어요.");
      throw new LandingSaveError(payload?.error?.code ?? "LANDING_SAVE_FAILED", koreanText(payload?.error?.message, "저장하지 못했어요. 수정 내용은 유지했어요. 다시 저장해 주세요."));
    }
    if (!payload?.site?.draft || payload.site.projectId !== projectId || typeof payload.site.updatedAt !== "string") {
      throw new LandingSaveError("LANDING_SAVE_UNCONFIRMED", "서버의 저장 결과를 확인하지 못했어요. 수정 내용은 유지했어요. 다시 저장해 주세요.");
    }
    return payload.site;
  } catch (error) {
    if (error instanceof LandingSaveError) throw error;
    throw new LandingSaveError(controller.signal.aborted ? "LANDING_SAVE_ABORTED" : "LANDING_SAVE_NETWORK", "연결이 끊기거나 응답이 늦어 저장을 확인하지 못했어요. 수정 내용은 유지했어요. 다시 저장해 주세요.");
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abort);
  }
}
