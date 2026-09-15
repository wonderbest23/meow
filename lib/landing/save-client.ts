import type { LandingDraft, LandingSiteRecord } from "./domain";
import { LANDING_CONFLICT_MESSAGE, type LandingSaveRequest } from "./save-contract";

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
      throw new LandingSaveError(payload?.error?.code ?? "LANDING_SAVE_FAILED", response.status === 409
        ? LANDING_CONFLICT_MESSAGE
        : payload?.error?.message ?? "저장하지 못했습니다. 수정 내용은 유지했어요. 다시 저장해주세요.");
    }
    if (!payload?.site?.draft || payload.site.projectId !== projectId || typeof payload.site.updatedAt !== "string") {
      throw new LandingSaveError("LANDING_SAVE_UNCONFIRMED", "서버의 저장 결과를 확인하지 못했습니다. 수정 내용을 유지한 채 다시 저장해주세요.");
    }
    return payload.site;
  } catch (error) {
    if (error instanceof LandingSaveError) throw error;
    throw new LandingSaveError(controller.signal.aborted ? "LANDING_SAVE_ABORTED" : "LANDING_SAVE_NETWORK", "연결이 끊기거나 응답이 늦어 저장을 확인하지 못했습니다. 수정 내용은 유지했어요. 다시 저장해주세요.");
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abort);
  }
}
