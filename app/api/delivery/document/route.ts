import { NextResponse } from "next/server";
import { z } from "zod";
import {
  packageDeliveryZip,
  renderDocx,
  renderPdf,
  type BusinessDocument,
  type DocumentProjectMeta,
} from "../../../../lib/delivery/document-renderer";
import { clientKey, enforceRateLimit } from "../../../../lib/rate-limit";

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

async function requestArchivePart(endpoint: URL, sharedPayload: object, format: "pdf" | "docx", clientIp: string) {
  let response: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await fetch(endpoint, {
      method: "POST",
      // Forward the originating client IP so the internal PDF/DOCX sub-requests count
      // against the same rate-limit bucket as the caller instead of a shared "unknown" one.
      headers: { "Content-Type": "application/json", "cf-connecting-ip": clientIp },
      body: JSON.stringify({ ...sharedPayload, format }),
    });
    if (response.ok || ![502, 503, 504].includes(response.status) || attempt === 2) return response;
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
  if (!response) throw new Error(`DOCUMENT_ARCHIVE_PART_UNAVAILABLE:${format}`);
  return response;
}

export async function POST(request: Request) {
  // Heavy render (font embedding + PDF/DOCX). A zip counts as 3 hits (entry + pdf + docx),
  // so 30 per 5 min allows ~10 full packages per client while blunting scripted abuse.
  const limited = await enforceRateLimit("delivery-document", request, {
    limit: 30,
    windowMs: 5 * 60_000,
    message: "문서 생성 요청이 너무 잦습니다. 잠시 후 다시 시도해주세요.",
  });
  if (limited) return limited;
  try {
    const payload = requestSchema.parse(await request.json()) as {
      format: "pdf" | "docx" | "zip";
      project: DocumentProjectMeta;
      documents: BusinessDocument[];
    };
    const baseName = safeFileName(payload.documents.length === 1
      ? payload.documents[0].title
      : `${payload.project.title}-전체-출시-문서`);
    let body: Buffer;
    if (payload.format === "zip") {
      const endpoint = new URL("/api/delivery/document", request.url);
      const sharedPayload = { project: payload.project, documents: payload.documents };
      // Both formats embed the Korean font. Running them together can exceed a
      // Worker's transient memory budget for large delivery packages.
      const clientIp = clientKey(request);
      const pdfResponse = await requestArchivePart(endpoint, sharedPayload, "pdf", clientIp);
      const docxResponse = await requestArchivePart(endpoint, sharedPayload, "docx", clientIp);
      if (!pdfResponse.ok || !docxResponse.ok) {
        throw new Error(`DOCUMENT_ARCHIVE_PART_FAILED:${pdfResponse.status}:${docxResponse.status}`);
      }
      body = await packageDeliveryZip(
        new Uint8Array(await pdfResponse.arrayBuffer()),
        new Uint8Array(await docxResponse.arrayBuffer()),
        payload.project,
      );
    } else {
      const fontResponse = await fetch(new URL("/fonts/NanumGothic-Regular.ttf", request.url));
      if (!fontResponse.ok) throw new Error(`DOCUMENT_FONT_UNAVAILABLE:${fontResponse.status}`);
      const fontData = new Uint8Array(await fontResponse.arrayBuffer());
      body = payload.format === "pdf"
        ? await renderPdf(payload.documents, payload.project, fontData)
        : await renderDocx(payload.documents, payload.project, fontData);
    }
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
    const retryable = message.startsWith("DOCUMENT_ARCHIVE_PART_FAILED") || message.startsWith("DOCUMENT_ARCHIVE_PART_UNAVAILABLE");
    return NextResponse.json({ error: { code: "DOCUMENT_GENERATION_FAILED", message } }, { status: retryable ? 503 : 400 });
  }
}
