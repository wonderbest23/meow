import type { CoachField, CoachState } from "./coach";
import type { ProposalSector } from "./proposal-blueprint";
import type { IntakeMode, IntakeQuestion } from "./intake-questions";

export const INTAKE_KEY = "__business_intake";
export const INTAKE_VERSION = 1;
export type IntakeValue = string | number | string[] | null;
export type IntakeAnswer = { status: "answered" | "unknown"; value: IntakeValue; messageId: string; at: string; quote?: string };
export type IntakeNote = { id: string; text: string; at: string; status: "queued" | "processing" | "review" | "stored" | "failed" };
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
};
export type IntakeCommand = {
  action: "start" | "answer" | "message" | "confirm-extraction" | "details" | "extract" | "extract-pending" | "help" | "design" | "prepare";
  planId?: string; revision: number; requestId: string;
  mode?: IntakeMode; questionId?: string; value?: IntakeValue; unknown?: boolean;
  message?: string; candidateIds?: string[]; rejectIds?: string[]; overwriteIds?: string[];
};
export type IntakeSnapshot = {
  planId: string; title: string; planType: string; updatedAt: string; coach: CoachState;
  intake: Omit<IntakeState, "receipts">; nextQuestion: IntakeQuestion | null;
  questions: IntakeQuestion[]; coreComplete: boolean; coreAnswered: number; coreTotal: number;
  summary: Array<{ id: string; label: string; value: string; basis: "user" | "proposal" | "unknown" }>;
  candidateIdeas: Array<{ id: string; title: string; description: string; sector: ProposalSector; reasons: string[]; cautions: string[] }>;
  financialSummary: string; hasDocuments: boolean; pendingExtraction: boolean;
};
export type IntakePayload = {
  flowVersion: 2; enabled: boolean; plan: IntakeSnapshot | null; authenticated?: boolean; ownerScope?: string;
  message?: string; code?: string; login?: boolean; started?: boolean; paid?: boolean;
};
export type IntakeJobRequest = { ownerHash: string; planId: string; jobId: string };

export function intakeFeatureEnabled() {
  return process.env.NEXT_PUBLIC_BUSINESS_INTAKE_V2 === "1";
}
