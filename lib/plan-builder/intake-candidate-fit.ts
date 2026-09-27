import { coachAmount } from "./coach-feasibility";
import { RESOURCE_KEYS, RESOURCE_LABELS, type ResourceKey, type ResourceRecord, type ResourceContext, sameResourceContext, loadResourceRecords, resourceAssumptionsMatch } from "./intake-candidate-resources";
import type { BusinessStructure } from "./business-structure";

export type ResourceLimit = { status: "known"; raw: string; lower: number; upper: number } | { status: "missing" | "unknown" | "invalid"; raw: string; reason: string };
export function parseResourceLimit(value: unknown, metric: ResourceKey): ResourceLimit {
  const raw = value == null ? "" : String(value).trim();
  if (!raw) return { status: "missing", raw, reason: "미입력" };
  if (/^(?:아직\s*)?(?:미정|모름|모르겠어요|모르겠습니다|unknown)$/i.test(raw)) return { status: "unknown", raw, reason: "아직 미정" };
  const invalid = (): ResourceLimit => ({ status: "invalid", raw, reason: "단위·기간·범위 확인 필요" });
  if (raw.length > 120) return invalid();
  const money = metric === "initialCost" || metric === "monthlyOperatingCost";
  if (/[\-$€£]|달러|USD|연간|매년|하루|매일|일당|년간/i.test(raw)) return invalid();
  if (money && /시간|분|주당|매주/.test(raw) || !money && /원|만원|억|월|매달/.test(raw)) return invalid();
  if (metric === "initialCost" && /월|매달/.test(raw) || metric === "preparationHours" && /주|매주/.test(raw)) return invalid();
  if (metric === "weeklyOperatingHours" && /준비|총/.test(raw) || metric === "monthlyOperatingCost" && /초기|일회/.test(raw)) return invalid();
  const compact = raw.replace(/초기|총|준비|주당|매주|매월|월당|매달|일회성|일회|운영|예산|한도/g, "").replace(/\/월|\/주|원\/월|시간\/주/g, "").replace(/^월/, "").replace(/\s/g, "");
  const parts = compact.split(/[~～〜–]/);
  if (!parts.length || parts.length > 2 || parts.some(p => !p)) return invalid();
  const lastSuffix = parts.at(-1)!.match(money ? /(억원?|천만원?|백만원?|만원?|천원?|백원?|원)$/ : /(시간)$/)?.[1] ?? "";
  const amounts = parts.map(p => {
    const token = /[억만천백원시간]/.test(p) ? p : p + lastSuffix;
    if (money) return coachAmount(token);
    return /^\d+(?:\.\d+)?(?:시간)?$/.test(token) ? Number.parseFloat(token) : undefined;
  });
  if (amounts.some(n => n === undefined || !Number.isFinite(n) || n < 0 || n > (metric === "weeklyOperatingHours" ? 168 : 1e14))) return invalid();
  const lower = amounts[0]!, upper = amounts.at(-1)!;
  return lower <= upper ? { status: "known", raw, lower, upper } : invalid();
}
export type ResourceMetricFit = { status: "fits" | "conditional" | "exceeded" | "unknown"; message: string; limit: ResourceLimit; evidence?: ResourceRecord };
export type ResourceFit = { status: ResourceMetricFit["status"]; checked: number; metrics: Record<ResourceKey, ResourceMetricFit> };
export function evaluateCandidateResources(candidateId: string, limits: Partial<Record<ResourceKey, unknown>>, context: ResourceContext | undefined, asOf: string, records: readonly ResourceRecord[] = loadResourceRecords(), structure?: BusinessStructure, business?: Record<string, string>): ResourceFit {
  const now = Date.parse(asOf);
  const metrics = Object.fromEntries(RESOURCE_KEYS.map(key => {
    const limit = parseResourceLimit(limits[key], key), label = RESOURCE_LABELS[key];
    const candidates = records.filter(r => r.candidateId === candidateId && r.metric === key && sameResourceContext(context, r.context));
    const current = candidates.filter(r => (!structure || resourceAssumptionsMatch(r, structure, business)) && r.complete && !r.excludedItems.length && Date.parse(r.source.validFrom) <= now && Date.parse(r.source.reviewedAt) <= now && now < Date.parse(r.source.expiresAt));
    const signatures = new Set(current.map(r => `${r.lower}:${r.upper}`));
    const evidence = signatures.size === 1 ? current[0] : undefined;
    const unknown = (reason: string): ResourceMetricFit => ({ status: "unknown", message: `${label} · ${reason}`, limit });
    if (!evidence) return [key, unknown(signatures.size > 1 ? "근거가 서로 달라 확인 필요" : structure && candidates.some(r => !resourceAssumptionsMatch(r, structure, business)) ? "사업 구조·제공 범위 가정 재확인 필요" : candidates.length ? "만료되었거나 전체 범위가 확인되지 않은 자료" : "적용 가능한 자료 부족")];
    if (limit.status !== "known") return [key, { ...unknown(limit.reason), evidence }];
    const status = evidence.lower > limit.upper ? "exceeded" : evidence.upper <= limit.lower ? "fits" : "conditional";
    const unit = key.includes("Cost") ? "원" : "시간";
    const range = evidence.lower === evidence.upper ? evidence.lower.toLocaleString("ko-KR") : `${evidence.lower.toLocaleString("ko-KR")}~${evidence.upper.toLocaleString("ko-KR")}`;
    return [key, { status, message: `${label} · ${status === "exceeded" ? "한도 초과" : status === "fits" ? "범위 충족" : "범위 내 조건부"} (필요 ${range}${unit})`, limit, evidence } satisfies ResourceMetricFit];
  })) as Record<ResourceKey, ResourceMetricFit>;
  const values = Object.values(metrics), status = values.some(v => v.status === "exceeded") ? "exceeded" : values.some(v => v.status === "conditional") ? "conditional" : values.some(v => v.status === "unknown") ? "unknown" : "fits";
  return { status, checked: values.filter(v => v.evidence).length, metrics };
}
