import type { BusinessDocument, DocumentProjectMeta } from "./document-renderer";

export type DownloadFormat = "pdf" | "docx" | "zip";

function safeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, "-").slice(0, 100);
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
  const response = await fetch("/api/delivery/document", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ format, project, documents }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(payload?.error?.message ?? "문서를 만들지 못했습니다.");
  }
  const baseName = documents.length === 1 ? documents[0].title : `${project.title}-전체-창업-실행-문서`;
  const url = URL.createObjectURL(await response.blob());
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = `${safeFileName(baseName)}.${format}`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
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
