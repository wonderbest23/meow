import type { CoachField, CoachState } from "./coach";
import type { BusinessStructure, StructureAxis } from "./business-structure";
import type { ProposalSector } from "./proposal-blueprint";
import type { IntakeMode, IntakeQuestion } from "./intake-questions";

export const INTAKE_KEY = "__business_intake";
export const INTAKE_VERSION = 1;
export type IntakeValue = string | number | string[] | null;
export type IntakeAnswer = { status: "answered" | "unknown"; value: IntakeValue; messageId: string; at: string; quote?: string };
export type IntakeNote = { id: string; text: string; at: string; status: "queued" | "processing" | "review" | "stored" | "failed"; intent?: "memo" | "question" };
export type IntakeCandidate = { id: string; fieldKey: CoachField["key"]; value: string; quote: string; noteId: string; baseValue: string | null; baseFieldRevision?: string | null; status: "pending" | "applied" | "rejected" };
export type IntakeJob = {
  id: string; runId: string; kind: "extract" | "help" | "design";
  status: "queued" | "running" | "complete" | "failed";
  noteIds: string[]; baseValues: Partial<Record<CoachField["key"], string>>;
  baseFieldRevisions?: Partial<Record<CoachField["key"], string | null>>;
  baseDocumentRevision: number; request?: string; reply?: string; error?: string;
  updatedAt: string; dispatched?: boolean;
};
export type IntakeState = {
  version: 1; stateRevision?: number; packVersion: string; mode: IntakeMode; sector: ProposalSector;
  answers: Record<string, IntakeAnswer>; detailsRequested: boolean;
  notes: IntakeNote[]; candidates: IntakeCandidate[]; job: IntakeJob | null;
  receipts: Array<{ id: string; signature: string }>;
  legacyImported: boolean;
  /** 사용자가 확정한 한국표준산업분류 세세분류 코드(5자리). 업종을 11업종으로만 고르면 null */
  ksic?: string | null;
  /** 사용자가 직접 고친 사업 구조 축(부분). KSIC·업종 기본값을 덮어쓴다 */
  structure?: Partial<BusinessStructure> | null;
};
export type IntakeCommand = {
  action: "start" | "answer" | "message" | "note" | "confirm-extraction" | "details" | "extract" | "extract-pending" | "help" | "design" | "prepare" | "structure";
  planId?: string; revision: number; requestId: string;
  mode?: IntakeMode; questionId?: string; value?: IntakeValue; unknown?: boolean;
  /** industry 답변에 함께 보내는 KSIC 세세분류 코드. value(11업종)는 서버가 코드에서 확인한다 */
  ksic?: string;
  /** action "structure": 사용자가 고친 구조 축(부분) */
  structure?: Partial<Pick<BusinessStructure, StructureAxis>>;
  message?: string; candidateIds?: string[]; rejectIds?: string[]; overwriteIds?: string[];
  noteIntent?: "memo" | "question";
};
export type IntakeSnapshot = {
  planId: string; title: string; planType: string; updatedAt: string; coach: CoachState;
  intake: Omit<IntakeState, "receipts">; nextQuestion: IntakeQuestion | null;
  questions: IntakeQuestion[]; coreComplete: boolean; coreAnswered: number; coreTotal: number;
  summary: Array<{ id: string; label: string; value: string; basis: "user" | "proposal" | "unknown" }>;
  candidateIdeas: Array<{ id: string; title: string; description: string; sector: ProposalSector; reasons: string[]; cautions: string[] }>;
  financialSummary: string; hasDocuments: boolean; pendingExtraction: boolean;
  /** 확정된 표준산업분류와 그 사업 구조 기본값 */
  ksic: { code: string; name: string; path: string; structure: BusinessStructure | null; summary: string[]; licenseHint: string | null } | null;
  /** 사업 설명에서 규칙으로 찾은 KSIC 후보(업종 질문용, AI 0회) */
  ksicCandidates: Array<{ code: string; name: string; path: string; sector: ProposalSector }>;
  /** 실제 적용 중인 사업 구조: KSIC 또는 업종 기본값 위에 사용자 수정을 얹은 값과 축별 출처 */
  /** fallback: 업종이 미분류이거나(기본값이 넓음) 여러 업종이 섞인 복합 사업일 때 화면이 구조를 직접 고르도록 안내한다. */
  structure: { values: BusinessStructure; basis: Record<StructureAxis, "user" | "ksic" | "sector">; summary: string[]; licenseHint: string | null; fallback: "unclassified" | "compound" | null } | null;
};
export type IntakePayload = {
  flowVersion: 2; enabled: boolean; plan: IntakeSnapshot | null; authenticated?: boolean; ownerScope?: string;
  message?: string; code?: string; login?: boolean; started?: boolean; paid?: boolean;
  /** GET ?ksic=검색어 응답: 업종 이름 검색 후보 */
  ksicCandidates?: IntakeSnapshot["ksicCandidates"];
};
export type IntakeJobRequest = { ownerHash: string; planId: string; jobId: string };

export function intakeFeatureEnabled() {
  return process.env.NEXT_PUBLIC_BUSINESS_INTAKE_V2 === "1";
}
