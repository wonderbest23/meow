import { DECK_PHASE_LABELS, deckFailureMessage, type PublicDeckJob } from "./deck-job-types";
import { PPT_PREPARING_MESSAGE } from "./deck-availability";

export function deckExportState(input: { job: PublicDeckJob | null; stale: boolean; loaded: boolean; statusError: boolean; generationEnabled: boolean }) {
  const { job, stale, loaded, statusError, generationEnabled } = input;
  if (!loaded || statusError) return { action: "refresh" as const, label: "PPT 상태 다시 확인", message: "저장된 PPT 제작 상태를 확인해주세요. 상태 확인만으로 새 제작이 시작되지는 않습니다." };
  if (job?.ready && !stale) return { action: "download" as const, label: "완성된 PPT 내려받기", message: DECK_PHASE_LABELS.ready };
  if (!generationEnabled) {
    const saved = job?.status === "failed"
      ? ` 이전 제작은 중단됐으며 ${job.resumable ? "슬라이드 초안과 작업 기록" : "작업 기록"}은 보관되어 있어요. 제작 재시도는 현재 중지되어 있습니다. 문의 번호: ${job.token.slice(0, 8)}`
      : job ? " 기존 자료와 작업 기록은 유지됩니다." : "";
    return { action: "refresh" as const, label: "PPT 제공 상태 확인", message: PPT_PREPARING_MESSAGE + saved };
  }
  const message = stale ? "계획서가 수정됐어요. 최신 내용으로 발표자료를 다시 만들어주세요."
    : job?.status === "failed" ? `${deckFailureMessage(job.code, job.resumable && !["source_validation_failed", "invalid_slides", "review_json_invalid"].includes(job.code ?? ""))} 문의 번호: ${job.token.slice(0, 8)}` : "";
  return { action: "generate" as const, label: stale ? "최신 내용으로 PPT 만들기" : job?.status === "failed" ? "발표자료 다시 시도" : "발표자료 PPT", message };
}
