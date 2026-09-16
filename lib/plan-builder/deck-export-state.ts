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

export function proposalEntryState(input: { job: PublicDeckJob | null; editable: boolean; generationEnabled: boolean }) {
  const { job, editable, generationEnabled } = input;
  if (editable) return { action: "initialize" as const, label: "편집본 만들기", message: "완성된 제안서를 편집본으로 열 수 있어요" };
  if (job?.status === "queued" || job?.status === "running") return { action: "wait" as const, label: "제안서 제작 중", message: DECK_PHASE_LABELS[job.phase] ?? "제작 상태를 확인하고 있어요" };
  if (job?.ready) return { action: generationEnabled ? "generate" as const : "blocked" as const, label: generationEnabled ? "새 형식으로 제안서 만들기" : "새 제안서 생성 준비 중", message: "이전 형식의 PPT는 문서에서 내려받을 수 있어요. 편집하려면 새 형식의 제안서가 필요해요" + (generationEnabled ? "" : " 새 제안서 생성은 현재 준비 중입니다") };
  const state = deckExportState({ job, generationEnabled, stale: false, loaded: true, statusError: false });
  if (!generationEnabled) return { action: "blocked" as const, label: "새 제안서 생성 준비 중", message: state.message };
  return { action: "generate" as const, label: job?.status === "failed" ? "제안서 다시 만들기" : "제안서 생성", message: state.message || "사업계획서를 고객 제안용 12장으로 구성합니다" };
}
