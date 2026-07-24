export const deliveryDocumentIds = [
  "brief",
  "market",
  "pricing",
  "brand",
  "landing",
  "launch",
  "plan",
  "operations",
  "execution",
  "grants",
] as const;

export type DeliveryDocumentId = (typeof deliveryDocumentIds)[number];

export type DocumentDraftVersion = {
  id: string;
  version: number;
  markdown: string;
  createdAt: string;
  summary: string;
};

export type DocumentDraft = {
  markdown: string;
  updatedAt: string;
  versions: DocumentDraftVersion[];
};

export type DocumentDrafts = Partial<Record<DeliveryDocumentId, DocumentDraft>>;

export type DocumentSection = {
  id: string;
  title: string;
  level: number;
  headingLine: number | null;
  bodyStartLine: number;
  endLine: number;
  body: string;
};

export function isDeliveryDocumentId(value: string): value is DeliveryDocumentId {
  return deliveryDocumentIds.includes(value as DeliveryDocumentId);
}

export function splitDocumentSections(markdown: string): DocumentSection[] {
  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
  const headingIndexes = lines.flatMap((line, index) => {
    const match = line.match(/^(#{1,2})\s+(.+?)\s*$/);
    return match ? [{ index, level: match[1].length, title: match[2].replace(/[*_`]/g, "").trim() }] : [];
  });
  const sections: DocumentSection[] = [];

  if (headingIndexes.length === 0 || headingIndexes[0].index > 0) {
    const endLine = headingIndexes[0]?.index ?? lines.length;
    const body = lines.slice(0, endLine).join("\n").trim();
    if (body) {
      sections.push({
        id: "document-intro",
        title: "문서 안내",
        level: 1,
        headingLine: null,
        bodyStartLine: 0,
        endLine,
        body,
      });
    }
  }

  headingIndexes.forEach((heading, index) => {
    const endLine = headingIndexes[index + 1]?.index ?? lines.length;
    sections.push({
      id: `section-${heading.index}`,
      title: heading.title,
      level: heading.level,
      headingLine: heading.index,
      bodyStartLine: heading.index + 1,
      endLine,
      body: lines.slice(heading.index + 1, endLine).join("\n").replace(/^\n+|\n+$/g, ""),
    });
  });

  return sections.length ? sections : [{
    id: "document-body",
    title: "문서 내용",
    level: 1,
    headingLine: null,
    bodyStartLine: 0,
    endLine: lines.length,
    body: markdown,
  }];
}

export function replaceDocumentSection(
  markdown: string,
  section: DocumentSection,
  nextBody: string,
) {
  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
  const replacement = nextBody.replaceAll("\r\n", "\n").replace(/^\n+|\n+$/g, "").split("\n");
  lines.splice(section.bodyStartLine, section.endLine - section.bodyStartLine, ...replacement);
  return lines.join("\n").replace(/\n{4,}/g, "\n\n\n").trim();
}

export function appendDocumentDraftVersion(
  current: DocumentDraft | undefined,
  markdown: string,
  summary: string,
  now = new Date().toISOString(),
): DocumentDraft {
  const previousVersions = current?.versions ?? [];
  const version = (previousVersions.at(-1)?.version ?? 0) + 1;
  const nextVersion: DocumentDraftVersion = {
    id: crypto.randomUUID(),
    version,
    markdown: markdown.trim(),
    createdAt: now,
    summary: summary.trim() || "문서 내용 수정",
  };
  return {
    markdown: nextVersion.markdown,
    updatedAt: now,
    versions: [...previousVersions, nextVersion].slice(-20),
  };
}

export function inspectDocumentDraft(markdown: string) {
  const sections = splitDocumentSections(markdown);
  const unresolved = (markdown.match(/(?:입력|확인|검증|추가)\s*(?:이|가|을|를|은|는)?\s*(?:필요|전)/g) ?? []).length;
  const suspicious = (markdown.match(/(?:example\.com|가상\s*사례|테스트\s*후보|업계\s*1위|100%\s*보장)/gi) ?? []).length;
  const emptySections = sections.filter((section) => (
    section.level >= 2 && section.body.replace(/[-|>*_`\s]/g, "").length < 12
  )).length;
  const urls = (markdown.match(/https?:\/\/[^\s)\]}>'"]+/g) ?? []).length;
  return {
    sections: sections.length,
    unresolved,
    suspicious,
    emptySections,
    urls,
    ready: suspicious === 0 && emptySections === 0,
  };
}
