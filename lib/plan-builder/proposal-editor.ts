import { z } from "zod";
import type { ProposalDocument, ProposalSlideEdits } from "./proposal-revision";
import type { ProposalOptions } from "./proposal-blueprint";
import type { ProposalRewrite } from "./proposal-rewrite";
import type { DocumentRefreshJob } from "./document-refresh";

export const PROPOSAL_KEY = "__proposal_editor";
export type ProposalVersion = { revision: number; savedAt: string; edits: Record<string, ProposalSlideEdits>; document?: ProposalDocument; fingerprint?: string; reason?: "edit" | "source_update" | "restore" };
export type SavedProposal = {
  version: 1; revision: number; savedAt: string; generationToken: string; fingerprint: string;
  document: ProposalDocument; history: ProposalVersion[];
  presentation?: Pick<ProposalOptions, "sector" | "purpose">;
  rewrite?: ProposalRewrite;
  rewriteAttempts?: Array<{ id: string; hash: string; startedAt: string }>;
  documentRefresh?: DocumentRefreshJob;
  documentRefreshAttempts?: Array<{ id: string; hash: string; sections: string[]; startedAt: string }>;
  receipts: Array<{ requestId: string; signature: string; revision: number }>;
};
export function proposalSnapshot(saved: SavedProposal, reason: NonNullable<ProposalVersion["reason"]>): ProposalVersion {
  return { revision: saved.revision, savedAt: saved.savedAt, edits: structuredClone(saved.document.edits), document: structuredClone(saved.document), fingerprint: saved.fingerprint, reason };
}
export function proposalHistory(saved: SavedProposal, reason: NonNullable<ProposalVersion["reason"]>) {
  // Older edit-only versions share the pre-update deck; materialize them before changing that base.
  const history = [...saved.history.map(version => version.document ? version : { ...version, fingerprint: saved.fingerprint, document: { ...structuredClone(saved.document), revision: version.revision, edits: structuredClone(version.edits) } }), proposalSnapshot(saved, reason)].slice(-20);
  const sizes = history.map(version => JSON.stringify(version).length);
  while (history.length > 1 && sizes.reduce((sum, size) => sum + size, 0) > 4_000_000) { history.shift(); sizes.shift(); }
  return history;
}
const box = z.object({ x: z.number().min(0).max(13.33), y: z.number().min(0).max(7.5), w: z.number().min(.25).max(13.33), h: z.number().min(.2).max(7.5) }).strict()
  .refine(value => value.x + value.w <= 13.33 && value.y + value.h <= 7.5, "슬라이드 안에 배치해 주세요");
export const proposalEditsSchema = z.object({
  text: z.object({ title: z.string().trim().min(1).max(60).optional(), lead: z.string().max(140).optional(), note: z.string().max(4000).optional() }).strict().optional(),
  layout: z.object({ title: box.optional(), lead: box.optional(), image: box.optional() }).strict().optional(),
  content: z.object({
    points: z.array(z.object({ label: z.string().min(1).max(20), detail: z.string().min(1).max(90) }).strict()).min(1).max(4).optional(),
    table: z.object({ headers: z.array(z.string().min(1).max(12)).min(2).max(4), rows: z.array(z.array(z.string().max(25))).min(1).max(5) }).strict().refine(value => value.rows.every(row => row.length === value.headers.length), "표의 열 수가 일치해야 해요").optional(),
  }).strict().optional(),
}).strict();
const base = { requestId: z.string().uuid(), expectedRevision: z.number().int().min(0) };
export const proposalCommandSchema = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("initialize"), generationToken: z.string().min(1).max(100) }).strict(),
  z.object({ ...base, type: z.literal("save"), edits: z.record(z.string().min(1).max(80), proposalEditsSchema).refine(value => Object.keys(value).length <= 30) }).strict(),
  z.object({ ...base, type: z.literal("restore"), revision: z.number().int().min(1) }).strict(),
]);
export type ProposalCommand = z.infer<typeof proposalCommandSchema>;
export function readSavedProposal(answers: Record<string, Record<string, unknown>>): SavedProposal | null {
  const value = answers[PROPOSAL_KEY];
  return value?.version === 1 && Number.isInteger(value.revision) && value.document ? value as unknown as SavedProposal : null;
}
export class ProposalError extends Error {
  constructor(public code: string, message: string, public status = 409) { super(message); }
}
