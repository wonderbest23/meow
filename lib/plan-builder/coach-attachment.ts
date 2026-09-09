import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import type { Readable } from "node:stream";

export const COACH_UPLOAD_LIMIT = 1024 * 1024;

export async function extractCoachAttachment(buffer: Uint8Array): Promise<string> {
  if (buffer.byteLength > COACH_UPLOAD_LIMIT) throw new Error("TOO_LARGE");
  const zip = await JSZip.loadAsync(buffer);
  const entry = zip.file("word/document.xml");
  if (!entry) throw new Error("NOT_DOCX");
  const xml = await new Promise<string>((resolve, reject) => {
    let size = 0;
    const parts: Buffer[] = [];
    const stream = entry.nodeStream("nodebuffer") as Readable;
    stream.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 2 * 1024 * 1024) { reject(new Error("TOO_LARGE")); stream.destroy(); }
      else parts.push(chunk);
    });
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(parts).toString("utf8")));
  });
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("INVALID_XML");
  const parsed = new XMLParser({ ignoreAttributes: true, parseTagValue: false }).parse(xml);
  const lines: string[] = [];
  function walk(node: unknown) {
    if (!node || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node)) {
      if (key === "w:t") lines.push(String(value));
      else if (Array.isArray(value)) value.forEach(item => { walk(item); if (key === "w:p") lines.push("\n"); });
      else { walk(value); if (key === "w:p") lines.push("\n"); }
    }
  }
  walk(parsed);
  const text = lines.join("").trim();
  if (!text || text.length > 18000) throw new Error("TEXT_LENGTH");
  return text;
}
