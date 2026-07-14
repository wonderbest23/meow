import { NextResponse } from "next/server";
import { z } from "zod";
import {
  renderDeliveryZip,
  renderDocx,
  renderPdf,
  type BusinessDocument,
  type DocumentProjectMeta,
} from "../../../../lib/delivery/document-renderer";

export const runtime = "nodejs";
export const maxDuration = 60;

const requestSchema = z.object({
  format: z.enum(["pdf", "docx", "zip"]),
  project: z.object({
    title: z.string().trim().min(1).max(160),
    sector: z.string().trim().max(120).default(""),
    model: z.string().trim().max(200).default(""),
    customer: z.string().trim().max(240).default(""),
    generatedAt: z.string().datetime(),
    sample: z.boolean().default(false),
  }),
  documents: z.array(z.object({
    id: z.string().trim().min(1).max(80),
    title: z.string().trim().min(1).max(160),
    type: z.string().trim().max(240),
    versionLabel: z.string().trim().max(80),
    markdown: z.string().min(20).max(500_000),
  })).min(1).max(20),
});

function safeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, "-").slice(0, 100);
}

export async function POST(request: Request) {
  try {
    const payload = requestSchema.parse(await request.json()) as {
      format: "pdf" | "docx" | "zip";
      project: DocumentProjectMeta;
      documents: BusinessDocument[];
    };
    const baseName = safeFileName(payload.documents.length === 1
      ? payload.documents[0].title
      : `${payload.project.title}-전체-출시-문서`);
    const body = payload.format === "pdf"
      ? await renderPdf(payload.documents, payload.project)
      : payload.format === "docx"
        ? await renderDocx(payload.documents, payload.project)
        : await renderDeliveryZip(payload.documents, payload.project);
    const contentType = payload.format === "pdf"
      ? "application/pdf"
      : payload.format === "docx"
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : "application/zip";
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${baseName}.${payload.format}`)}`,
        "Content-Length": String(body.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof z.ZodError
      ? error.issues.map((issue) => issue.message).join(", ")
      : error instanceof Error ? error.message : "문서를 만들지 못했습니다.";
    return NextResponse.json({ error: { code: "DOCUMENT_GENERATION_FAILED", message } }, { status: 400 });
  }
}
