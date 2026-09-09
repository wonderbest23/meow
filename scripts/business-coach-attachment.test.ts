import assert from "node:assert/strict";
import JSZip from "jszip";
import { extractCoachAttachment } from "../lib/plan-builder/coach-attachment";

async function file(xml: string) { const zip = new JSZip(); zip.file("word/document.xml", xml); return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }); }
async function main() {
  const doc = '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>운영 중인 사진 가게</w:t></w:r></w:p><w:p><w:r><w:t>예산 300만원</w:t></w:r></w:p></w:body></w:document>';
  assert.equal(await extractCoachAttachment(await file(doc)), "운영 중인 사진 가게\n예산 300만원");
  await assert.rejects(() => extractCoachAttachment(new Uint8Array(1024 * 1024 + 1)), /TOO_LARGE/);
  await assert.rejects(() => extractCoachAttachment(new Uint8Array([1, 2, 3])));
  const entities = await file('<!DOCTYPE x [<!ENTITY a "abc">]><w:t>&a;</w:t>');
  await assert.rejects(() => extractCoachAttachment(entities), /INVALID_XML/);
  const bomb = await file("x".repeat(2 * 1024 * 1024 + 1));
  await assert.rejects(() => extractCoachAttachment(bomb), /TOO_LARGE/);
  console.log("business-coach attachment: Word text, invalid XML, upload limit and decompression limit passed");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
