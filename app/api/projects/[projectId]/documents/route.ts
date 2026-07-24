import { NextResponse } from "next/server";
import { z } from "zod";
import { requireGuestIdentity } from "../../../../../lib/api-auth";
import {
  appendDocumentDraftVersion,
  isDeliveryDocumentId,
  type DocumentDrafts,
} from "../../../../../lib/delivery/document-drafts";
import {
  getProjectDocumentDrafts,
  getProjectDocumentEditState,
  saveDocumentDrafts,
} from "../../../../../lib/project-repository";

const requestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save"),
    documentId: z.string().trim().min(1).max(40),
    markdown: z.string().trim().min(20).max(400_000),
    summary: z.string().trim().max(160).default("문서 내용 수정"),
  }),
  z.object({
    action: z.literal("restore"),
    documentId: z.string().trim().min(1).max(40),
    versionId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("reset"),
    documentId: z.string().trim().min(1).max(40),
  }),
]);

function privateJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const identity = await requireGuestIdentity();
    const drafts = await getProjectDocumentDrafts(projectId, identity.hash);
    if (!drafts) throw new Error("PROJECT_NOT_FOUND");
    return privateJson({ drafts });
  } catch (error) {
    const message = error instanceof Error ? error.message : "문서 수정본을 불러오지 못했습니다.";
    return privateJson({ error: { code: message === "PROJECT_NOT_FOUND" ? message : "DOCUMENT_DRAFT_LOAD_FAILED", message } }, { status: message === "PROJECT_NOT_FOUND" ? 404 : 400 });
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const identity = await requireGuestIdentity();
    const input = requestSchema.parse(await request.json());
    if (!isDeliveryDocumentId(input.documentId)) throw new Error("DOCUMENT_NOT_FOUND");
    const state = await getProjectDocumentEditState(projectId, identity.hash);
    if (!state) throw new Error("PROJECT_NOT_FOUND");
    if (!state.readyDocumentIds.includes(input.documentId)) throw new Error("DOCUMENT_NOT_READY");

    const drafts: DocumentDrafts = structuredClone(state.drafts);
    if (input.action === "reset") {
      delete drafts[input.documentId];
    } else if (input.action === "restore") {
      const current = drafts[input.documentId];
      const version = current?.versions.find((item) => item.id === input.versionId);
      if (!current || !version) throw new Error("DOCUMENT_VERSION_NOT_FOUND");
      if (current.markdown !== version.markdown) {
        drafts[input.documentId] = appendDocumentDraftVersion(
          current,
          version.markdown,
          `${version.version}차 수정본으로 되돌림`,
        );
      }
    } else {
      const current = drafts[input.documentId];
      if (current?.markdown !== input.markdown.trim()) {
        drafts[input.documentId] = appendDocumentDraftVersion(
          current,
          input.markdown,
          input.summary,
        );
      }
    }

    const saved = await saveDocumentDrafts(projectId, identity.hash, drafts);
    return privateJson({ drafts: saved, draft: saved[input.documentId] ?? null, savedAt: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "문서 수정본을 저장하지 못했습니다.";
    const status = message === "PROJECT_NOT_FOUND" || message === "DOCUMENT_NOT_FOUND"
      ? 404
      : message === "DOCUMENT_NOT_READY" || message === "DOCUMENT_VERSION_NOT_FOUND" ? 409 : 400;
    const userMessage = message === "DOCUMENT_NOT_READY"
      ? "먼저 이 문서의 기본 초안을 만들어주세요."
      : message === "DOCUMENT_VERSION_NOT_FOUND"
        ? "되돌릴 판을 찾지 못했습니다. 화면을 새로 열어주세요."
        : message;
    return privateJson({ error: { code: message, message: userMessage } }, { status });
  }
}
