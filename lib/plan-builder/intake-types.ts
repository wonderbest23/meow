import type { NarrationFacts } from "./work-narration";
import type { CoachField, CoachState } from "./coach";
import type { BusinessStructure, StructureAxis } from "./business-structure";
import type { ProposalSector } from "./proposal-blueprint";
import type { IntakeMode, IntakeQuestion } from "./intake-questions";
import type { ResourceContext, ResourceRecord, ResourceQuote, ResourceKey } from "./intake-candidate-resources";
import type { ResourceFit } from "./intake-candidate-fit";
export type IntakeIdea = { id: string; title: string; description: string; sector: ProposalSector; reasons: string[]; cautions: string[]; resourceFit?: ResourceFit; retained?: boolean; source?: "ai-generated"; proposedStructure?: Partial<BusinessStructure> };
export type GeneratedIntakeIdea = IntakeIdea & { source: "ai-generated"; planId: string; baseInputRevision: number; generatedAt: string; customer: string; problem: string; offering: string; delivery: string; revenue: string; differences: string; unknowns: string[]; rejected?: boolean };
export type IdeaTurn = { id: string; request: string; rejectedIds: string[]; baseInputRevision: number; at: string; status: "queued" | "complete" | "failed" };

export const INTAKE_KEY = "__business_intake";
export const INTAKE_VERSION = 1;
export type IntakeValue = string | number | string[] | null;
export type IntakeAnswer = { status: "answered" | "unknown"; value: IntakeValue; messageId: string; at: string; quote?: string };
export type IntakeNote = { id: string; text: string; at: string; status: "queued" | "processing" | "review" | "stored" | "failed"; intent?: "memo" | "question" };
export type IntakeCandidate = { id: string; fieldKey: CoachField["key"]; value: string; quote: string; noteId: string; baseValue: string | null; baseFieldRevision?: string | null; status: "pending" | "applied" | "rejected" };
export type IntakeJob = {
  id: string; runId: string; kind: "extract" | "help" | "design" | "ideas" | "edit";
  status: "queued" | "running" | "complete" | "failed";
  noteIds: string[]; baseValues: Partial<Record<CoachField["key"], string>>;
  baseFieldRevisions?: Partial<Record<CoachField["key"], string | null>>;
  baseDocumentRevision: number; request?: string; reply?: string; error?: string;
  updatedAt: string; dispatched?: boolean;
  /** 요청 시각. 진행 게이지가 화면을 나갔다 와도 같은 기준으로 이어지게 한다(이전 기록에는 없을 수 있다). */
  createdAt?: string;
  baseIdeaRevision?: number;
  /** kind "edit": the fact changes the AI proposed (validated), and what the owner did with them. */
  proposal?: Array<{ questionId: string; value: IntakeValue }>;
  proposalStatus?: "applied" | "dismissed";
  /**
   * kind "edit" · 계획서 전: 칸으로 옮길 값은 없지만 적은 말을 넣어 사업 방향을 다시 정리하자는 제안('정기배송도 하고 싶어요').
   * proposal 이 비어도 이 값이 있으면 확인(바꾸기 · 그대로 두기)을 기다린다.
   */
  rethink?: boolean;
};
export type IntakeState = {
  version: 1; stateRevision?: number; packVersion: string; mode: IntakeMode; sector: ProposalSector;
  answers: Record<string, IntakeAnswer>; detailsRequested: boolean;
  notes: IntakeNote[]; candidates: IntakeCandidate[]; job: IntakeJob | null;
  receipts: Array<{ id: string; signature: string }>;
  legacyImported: boolean;
  /** 사용자가 확정한 한국표준산업분류 세세분류 코드(5자리). 업종을 11업종으로만 고르면 null */
  ksic?: string | null;
  /** 사용자가 직접 고친 사업 구조 축(부분). KSIC·업종 기본값을 덮어쓴다 */
  structure?: Partial<BusinessStructure> | null;
  resourceContext?: ResourceContext;
  resourceQuotes?: ResourceRecord[];
  selectedCandidate?: IntakeIdea;
  ideaInputRevision?: number;
  ideaTurns?: IdeaTurn[];
  generatedIdeas?: GeneratedIntakeIdea[];
  /** 추천 이름을 처음 고르기 전의 사업 이름. 결과 화면에서 원래 이름으로 되돌리는 칩에 쓴다 */
  originalName?: string;
  /**
   * 고른 업종과 사업 설명이 어긋날 때 한 번 묻는 확인의 답. business는 확인할 때의 사업 설명이라,
   * 설명을 바꾸면 다시 한 번만 묻는다(2026-10-22 캔들 스마트스토어를 '기업 서비스'로 골라 '프로젝트 1건 가격'을 물었다).
   */
  sectorCheck?: { business: string; decision: "kept" | "changed" };
  /**
   * 대화 방식(대표 결정 2026-11-13) — 없으면 '일반'(한 문장만 받고 나머지는 업종 기준값으로 채워 바로 초안), "expert"면 '전문가'(채우지 않고 하나씩 묻는다).
   * 계획서를 만들기 전까지만 바꿀 수 있다.
   */
  depth?: "expert";
  /** 일반 모드에서 사업 문장을 AI로 한 번 읽었다(읽은 것이 없어도 켠다 — 사업마다 한 번만 부른다) */
  understood?: boolean;
  /**
   * 처음 적은 말이 사업 설명이 아니어서(바람 · 푸념 · 장난) 첫 문장 읽기가 그 말로 사업 한 줄을 잡아 넣었다(2026-11-19, intake-core applyShapedBusiness).
   * from 은 처음 적은 말, to 는 잡은 사업. 사업마다 한 번만 한다. 사용자가 사업 설명을 직접 고치면 to 와 달라지므로 그때부터는 보통 사업 문장으로 다룬다.
   */
  shaped?: { from: string; to: string };
  /**
   * '생각한 사업'으로 들어왔지만 글을 읽어 보니 이미 운영 중인 가게다(2026-11-18). 흐름(질문 수)은 그대로 두고 어긋나는 것만 고친다:
   * 목표를 '6개월 안에 손익분기'로 채우지 않고 묻고, 준비 예산은 '이번에 새로 해 볼 일에 쓸 돈'으로 묻는다.
   */
  running?: boolean;
};
export const INTAKE_ACTIONS = ["start", "answer", "message", "note", "confirm-extraction", "details", "extract", "extract-pending", "help", "design", "ideas", "prepare", "structure", "resources", "name", "edit", "edit-apply", "edit-dismiss", "sector-keep", "depth", "understand", "read"] as const;
export type IntakeCommand = {
  action: (typeof INTAKE_ACTIONS)[number];
  planId?: string; revision: number; requestId: string;
  /** action "understand": 사용자가 적은 문장에서 읽은 답(서버가 AI로 읽어 넣는다 — 화면이 보내지 않는다) */
  understood?: Array<{ questionId: string; value: IntakeValue }>;
  /** 첫 문장 읽기에서 적히지 않은 칸을 이 사업에 맞게 짐작한 값 — 기준표 값만 바꾼다(제안) */
  guessed?: Array<{ questionId: string; value: IntakeValue }>;
  /** action "read": 대화 중 적은 말에서 AI가 읽은 것(intake-reader) — 질문의 답 · 주당 영업일 · 모른다고 한 질문. 서버가 읽어 넣는다(INTAKE_AI_READER) */
  read?: { answers: Array<{ questionId: string; value: IntakeValue; quote: string }>; operatingDays?: { days: number; quote: string }; unknown: string[]; /** 손님이 아니라고(많다 · 적다 · 무리다) 했지만 새 값은 말하지 않은 칸 — 먼저 채운 값이면 걷어 내고 다시 묻는다 */ doubted?: string[] };
  /** action "start"(새 대화) · "depth"(진행 중 바꾸기): 대화 방식 */
  depth?: "easy" | "expert";
  mode?: IntakeMode; questionId?: string; value?: IntakeValue; unknown?: boolean;
  /** action "answer": 현실 범위 밖 금액(생활비 3,000원 등)을 사용자가 [맞아요]로 확인했다(amountCheckPrompt) */
  confirmed?: boolean;
  /** industry 답변에 함께 보내는 KSIC 세세분류 코드. value(11업종)는 서버가 코드에서 확인한다 */
  ksic?: string;
  /** action "structure": 사용자가 고친 구조 축(부분) */
  structure?: Partial<Pick<BusinessStructure, StructureAxis>>;
  message?: string; candidateIds?: string[]; rejectIds?: string[]; overwriteIds?: string[];
  noteIntent?: "memo" | "question";
  resourceLimits?: Partial<Record<ResourceKey, string | null>>;
  resourceContext?: ResourceContext;
  resourceQuote?: ResourceQuote;
};
export type IntakeSnapshot = {
  planId: string; title: string; planType: string; updatedAt: string; coach: CoachState;
  intake: Omit<IntakeState, "receipts">; nextQuestion: IntakeQuestion | null;
  questions: IntakeQuestion[]; coreComplete: boolean; coreAnswered: number; coreTotal: number;
  summary: Array<{ id: string; label: string; value: string; basis: "user" | "proposal" | "unknown" }>;
  candidateIdeas: IntakeIdea[];
  resourceAssessment?: { version: string; asOf: string; total: number; excluded: IntakeIdea[]; excludedCount: number; selected?: IntakeIdea; allUnknown: boolean };
  /** 진행 중인 AI 작업의 서버 기준 경과 시간과 예상·최대 시간. 응답을 보낼 때 HTTP 층이 붙인다(기기 시계 오차와 무관). */
  jobClock?: { elapsedMs: number; expectedMs: number; limitMs: number } | null;
  /** AI 작업 대기 문구에 쓰는 사실(업종 가이드 이름 · 직접 답한 숫자로 코드가 계산한 값). HTTP 층이 붙인다(work-narration-facts.ts). */
  narration?: NarrationFacts | null;
  financialSummary: string; financialWarning?: { message: string; fields: Array<"price" | "unitCost" | "cost"> } | null; hasDocuments: boolean; pendingExtraction: boolean;
  documentStatus?: "none" | "current" | "stale" | "unverified";
  /** 지금 계획서에 반영하면 AI 가 다시 쓰는 항목 수(다시 쓰기 횟수 차감량) */
  rewriteCount?: number;
  /** 이 계획서에 남은 무료 반영 번수(free-reflect.ts) */
  freeReflects?: number;
  /** 아직 한 번도 쓰지 않은 항목 수 — 예전 무료 체험으로 앞 2개만 있거나 작성 중 실패로 건너뛴 항목. 있으면 '이어서 작성'을 보여 준다 */
  missingSections?: number;
  /** 확정된 표준산업분류와 그 사업 구조 기본값 */
  ksic: { code: string; name: string; path: string; structure: BusinessStructure | null; summary: string[]; licenseHint: string | null } | null;
  /** 고른 업종보다 사업 설명에 더 가까운 업종(규칙, AI 0회). 있으면 채팅이 다음 질문 전에 한 번 바꿀지 묻는다 */
  sectorSuggestion?: { sector: ProposalSector; label: string; current: string } | null;
  /** 사업 설명에서 규칙으로 찾은 KSIC 후보(업종 질문용, AI 0회) */
  ksicCandidates: Array<{ code: string; name: string; path: string; sector: ProposalSector }>;
  /** 실제 적용 중인 사업 구조: KSIC 또는 업종 기본값 위에 사용자 수정을 얹은 값과 축별 출처 */
  /** fallback: 업종이 미분류이거나(기본값이 넓음) 여러 업종이 섞인 복합 사업일 때 화면이 구조를 직접 고르도록 안내한다. */
  structure: { values: BusinessStructure; basis: Record<StructureAxis, "user" | "ksic" | "sector">; summary: string[]; licenseHint: string | null; fallback: "unclassified" | "compound" | null } | null;
};
export type IntakePayload = {
  flowVersion: 2; enabled: boolean; plan: IntakeSnapshot | null; authenticated?: boolean; ownerScope?: string;
  message?: string; code?: string; login?: boolean; started?: boolean; paid?: boolean;
  /** 로그인해야 사업 기획을 쓸 수 있다(비로그인 방문) */
  loginRequired?: boolean;
  /** GET ?ksic=검색어 응답: 업종 이름 검색 후보 */
  ksicCandidates?: IntakeSnapshot["ksicCandidates"];
};
export type IntakeJobRequest = { ownerHash: string; planId: string; jobId: string };

export function intakeFeatureEnabled() {
  return process.env.NEXT_PUBLIC_BUSINESS_INTAKE_V2 === "1";
}
