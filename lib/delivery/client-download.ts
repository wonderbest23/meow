import type { BusinessDocument, DocumentProjectMeta } from "./document-renderer";

export type DownloadFormat = "pdf" | "docx" | "zip";

function safeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, "-").slice(0, 100);
}

export async function createBusinessDocumentsBlob({
  format,
  project,
  documents,
}: {
  format: DownloadFormat;
  project: DocumentProjectMeta;
  documents: BusinessDocument[];
}): Promise<Blob> {
  const body = JSON.stringify({ format, project, documents });
  let response: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await fetch("/api/delivery/document", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (response.ok) return response.blob();
    if (![502, 503, 504].includes(response.status) || attempt === 2) break;
    await new Promise((resolve) => window.setTimeout(resolve, 700 * (attempt + 1)));
  }
  const payload = await response?.json().catch(() => null) as { error?: { message?: string } } | null;
  throw new Error(payload?.error?.message ?? "문서를 만들지 못했습니다. 잠시 뒤 다시 시도해주세요.");
}

export function saveDownloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = safeFileName(filename);
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export async function downloadBusinessDocuments({
  format,
  project,
  documents,
}: {
  format: DownloadFormat;
  project: DocumentProjectMeta;
  documents: BusinessDocument[];
}) {
  const blob = await createBusinessDocumentsBlob({ format, project, documents });
  const baseName = documents.length === 1 ? documents[0].title : `${project.title}-전체-창업-실행-문서`;
  saveDownloadBlob(blob, `${baseName}.${format}`);
}

export function asBusinessDocument({
  id,
  title,
  type,
  versionLabel = "생성본",
  markdown,
}: BusinessDocument): BusinessDocument {
  return { id, title, type, versionLabel, markdown };
}
