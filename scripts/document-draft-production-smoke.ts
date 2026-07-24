import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import JSZip from "jszip";
import { assembleDeliveryPackage } from "../lib/delivery/package-assembler";
import { GUEST_COOKIE, hashIdentityToken } from "../lib/identity-tokens";
import {
  approveArtifact,
  beginGeneration,
  createProject,
  deleteProject,
  finishGeneration,
  getProject,
  saveStageInputs,
} from "../lib/project-repository";
import { generateStageArtifact } from "../lib/stage-generator";

const baseUrl = (process.env.SMOKE_BASE_URL?.trim() || "https://today-startup.rena35200.workers.dev").replace(/\/$/, "");
const guestToken = randomBytes(32).toString("base64url");
const guestTokenHash = hashIdentityToken(guestToken);
const cookie = `${GUEST_COOKIE}=${guestToken}`;
const marker = `PRODUCTION_DRAFT_E2E_${Date.now()}`;

const stageInputs = {
  goal: "소상공인의 반복 행정 업무를 정리해 주는 온라인 문서 도우미를 작게 검증한다.",
  availableHoursPerWeek: 12,
  budgetWon: 3_000_000,
  mustAvoid: ["검증 전 개발 외주", "확인되지 않은 시장 수치 단정"],
  existingAssets: ["문서 작성 경험", "소상공인 지인 5명"],
  referenceUrls: [],
  notes: "운영 배포본의 문서 수정, 복원, 내려받기 연결을 검증하는 격리 시험 프로젝트",
};

const opportunity = {
  id: `smoke-${Date.now()}`,
  title: "소상공인 행정 문서 도우미",
  oneLiner: "반복되는 사업 문서를 질문 몇 개로 정리해 초안을 제공하는 온라인 서비스",
  sector: "사업 지원 소프트웨어",
  model: "월 구독과 문서별 결제",
  customer: "문서 작성에 익숙하지 않은 1인 사업자와 소상공인",
  capital: "소액",
  launchTime: "4~8주",
  revenue: "월 구독료와 문서 제작비",
  stage: "아이디어 검증",
  riasec: ["E", "C"],
  founder: ["체계형", "실행형"],
  market: 72,
  novelty: 64,
  feasibility: 81,
  evidenceStatus: "hypothesis",
  evidenceSources: [],
  regulation: 35,
  skills: ["문서 기획", "고객 인터뷰"],
  risk: "개인정보 처리 범위와 생성 결과의 사실성 검토가 필요함",
  firstTest: "소상공인 5명에게 실제 문서 한 종류의 초안을 제공하고 수정 요청과 지불 의사를 기록합니다.",
  color: "#0f766e",
  match: 84,
  reasons: ["초기 비용이 낮음", "보유 역량으로 직접 검증 가능"],
  caution: "확인되지 않은 수치와 법률 판단은 가정 또는 확인 필요로 표시해야 합니다.",
};

type JsonRecord = Record<string, unknown>;

async function jsonRequest(path: string, init: RequestInit = {}) {
  let response: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        Cookie: cookie,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
    if (response.ok || ![502, 503, 504].includes(response.status) || attempt === 2) break;
    await response.body?.cancel().catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
  if (!response) throw new Error(`${init.method ?? "GET"} ${path} did not return a response`);
  const text = await response.text();
  let body: JsonRecord = {};
  try {
    body = text ? JSON.parse(text) as JsonRecord : {};
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  if (!response.ok) {
    throw new Error(`${init.method ?? "GET"} ${path} failed (${response.status}): ${JSON.stringify(body)}`);
  }
  return { response, body };
}

async function renderDocument(format: "pdf" | "docx", markdown: string) {
  const body = JSON.stringify({
    format,
    project: {
      title: opportunity.title,
      sector: opportunity.sector,
      model: opportunity.model,
      customer: opportunity.customer,
      generatedAt: new Date().toISOString(),
      sample: false,
    },
    documents: [{
      id: "brief",
      title: "사업 실행 요약",
      type: "사업 실행 문서",
      versionLabel: "복원 확인본",
      markdown,
    }],
  });
  let response: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await fetch(`${baseUrl}/api/delivery/document`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body,
    });
    if (response.ok || ![502, 503, 504].includes(response.status) || attempt === 2) break;
    await response.body?.cancel().catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
  }
  if (!response) throw new Error(`document ${format} did not return a response`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!response.ok) {
    throw new Error(`document ${format} failed (${response.status}): ${new TextDecoder().decode(bytes).slice(0, 500)}`);
  }
  return bytes;
}

async function main() {
  let projectId: string | null = null;
  let cleanedUp = false;

  try {
  let project = await createProject({
    opportunity,
    founderProfile: { source: "production-document-smoke", name: "격리 시험 사용자" },
    paymentStatus: "test_paid",
    packagePrice: 0,
    initialStageInputs: stageInputs,
  }, guestTokenHash);
  projectId = project.id;

  await saveStageInputs(project.id, 0, guestTokenHash, stageInputs);
  project = await getProject(project.id, guestTokenHash) ?? project;
  const job = await beginGeneration(
    project.id,
    0,
    guestTokenHash,
    project.stages[0].inputs,
    "deterministic-fallback-v1",
  );
  const generated = await generateStageArtifact(project, 0, undefined, false);
  const { model, ...artifactInput } = generated;
  const artifact = await finishGeneration(project.id, 0, guestTokenHash, job.id, artifactInput, model);
  await approveArtifact(project.id, 0, artifact.id, guestTokenHash);

  project = await getProject(project.id, guestTokenHash) ?? project;
  const source = assembleDeliveryPackage(project).items.find((item) => item.id === "brief");
  assert(source?.complete, "격리 프로젝트의 사업 실행 요약이 생성되지 않았습니다.");
  assert(source.markdown.length >= 500, "기본 초안이 지나치게 짧습니다.");

  const initial = await jsonRequest(`/api/projects/${project.id}/documents`);
  assert.deepEqual(initial.body.drafts, {}, "새 프로젝트에 예상하지 않은 수정본이 있습니다.");

  const firstMarkdown = `${source.markdown}\n\n## 운영 저장 확인\n\n${marker}_FIRST`;
  const firstSave = await jsonRequest(`/api/projects/${project.id}/documents`, {
    method: "PUT",
    body: JSON.stringify({
      action: "save",
      documentId: "brief",
      markdown: firstMarkdown,
      summary: "운영 서버 1차 저장 확인",
    }),
  });
  const firstDraft = firstSave.body.draft as JsonRecord;
  const firstVersions = firstDraft.versions as JsonRecord[];
  assert.equal(firstVersions.length, 1, "1차 저장 이력이 정확히 한 건이어야 합니다.");
  assert.equal(firstVersions[0].version, 1);

  const persisted = await jsonRequest(`/api/projects/${project.id}/documents`);
  const persistedBrief = (persisted.body.drafts as JsonRecord).brief as JsonRecord;
  assert.match(String(persistedBrief.markdown), new RegExp(`${marker}_FIRST`));

  const secondMarkdown = `${firstMarkdown}\n\n${marker}_SECOND`;
  const secondSave = await jsonRequest(`/api/projects/${project.id}/documents`, {
    method: "PUT",
    body: JSON.stringify({
      action: "save",
      documentId: "brief",
      markdown: secondMarkdown,
      summary: "운영 서버 2차 저장 확인",
    }),
  });
  const secondDraft = secondSave.body.draft as JsonRecord;
  assert.equal((secondDraft.versions as JsonRecord[]).length, 2, "2차 저장 이력이 누락되었습니다.");

  const restored = await jsonRequest(`/api/projects/${project.id}/documents`, {
    method: "PUT",
    body: JSON.stringify({
      action: "restore",
      documentId: "brief",
      versionId: firstVersions[0].id,
    }),
  });
  const restoredDraft = restored.body.draft as JsonRecord;
  const restoredMarkdown = String(restoredDraft.markdown);
  assert.match(restoredMarkdown, new RegExp(`${marker}_FIRST`));
  assert.doesNotMatch(restoredMarkdown, new RegExp(`${marker}_SECOND`));
  assert.equal((restoredDraft.versions as JsonRecord[]).length, 3, "복원 이력이 새 판으로 남지 않았습니다.");

  const pdfBytes = await renderDocument("pdf", restoredMarkdown);
  const docxBytes = await renderDocument("docx", restoredMarkdown);
  assert.equal(new TextDecoder().decode(pdfBytes.slice(0, 4)), "%PDF", "PDF 서명이 올바르지 않습니다.");
  assert.equal(new TextDecoder().decode(docxBytes.slice(0, 2)), "PK", "워드 파일 서명이 올바르지 않습니다.");
  assert(pdfBytes.length >= 10_000, "PDF 결과가 지나치게 작습니다.");
  assert(docxBytes.length >= 10_000, "워드 결과가 지나치게 작습니다.");
  const docx = await JSZip.loadAsync(docxBytes);
  const documentXml = await docx.file("word/document.xml")?.async("string");
  assert(documentXml?.includes(`${marker}_FIRST`), "복원된 수정 내용이 워드 파일에 반영되지 않았습니다.");
  assert(!documentXml?.includes(`${marker}_SECOND`), "복원 전 내용이 워드 파일에 남았습니다.");

  await jsonRequest(`/api/projects/${project.id}/documents`, {
    method: "PUT",
    body: JSON.stringify({ action: "reset", documentId: "brief" }),
  });
  const reset = await jsonRequest(`/api/projects/${project.id}/documents`);
  assert(!(reset.body.drafts as JsonRecord).brief, "초기화 후 수정본이 남아 있습니다.");

  await jsonRequest(`/api/projects/${project.id}`, { method: "DELETE" });
  cleanedUp = true;
  const missing = await fetch(`${baseUrl}/api/projects/${project.id}/documents`, { headers: { Cookie: cookie } });
  assert.equal(missing.status, 404, "삭제한 시험 프로젝트가 운영 API에서 계속 조회됩니다.");

  console.log(JSON.stringify({
    passed: true,
    baseUrl,
    projectId: project.id,
    projectDeleted: true,
    sourceMarkdownCharacters: source.markdown.length,
    saveVersions: 2,
    restoredVersions: 3,
    restoredFirstVersion: true,
    pdfBytes: pdfBytes.length,
    docxBytes: docxBytes.length,
    docxContainsRestoredEdit: true,
    resetVerified: true,
  }, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  } finally {
    if (projectId && !cleanedUp) {
      try {
        const deleted = await deleteProject(projectId, guestTokenHash);
        if (!deleted) console.error(`시험 프로젝트 자동 삭제에 실패했습니다: ${projectId}`);
      } catch (cleanupError) {
        console.error(`시험 프로젝트 정리 오류 (${projectId}): ${cleanupError instanceof Error ? cleanupError.message : cleanupError}`);
        process.exitCode = 1;
      }
    }
  }
}

void main();
