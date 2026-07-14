import { getServerSupabase } from "../persistence";
import type {
  LegalSourceDefinition,
  LegalSourceSnapshot,
} from "./domain";

export const legalSourceRegistry: LegalSourceDefinition[] = [
  {
    id: "business-registration",
    name: "사업자등록 안내",
    authority: "국세청",
    url: "https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7777&mi=2444",
    reviewIntervalDays: 30,
    affectedModules: ["사업자 형태", "등록 체크리스트", "사업계획서"],
  },
  {
    id: "privacy-protection-act",
    name: "개인정보 보호법",
    authority: "국가법령정보센터",
    url: "https://www.law.go.kr/법령/개인정보보호법",
    reviewIntervalDays: 14,
    affectedModules: ["판매 페이지 신청폼", "고객 신청정보", "개인정보 업무 절차"],
  },
  {
    id: "ecommerce-consumer-act",
    name: "전자상거래 등에서의 소비자보호에 관한 법률",
    authority: "국가법령정보센터",
    url: "https://www.law.go.kr/법령/전자상거래등에서의소비자보호에관한법률",
    reviewIntervalDays: 14,
    affectedModules: ["통신판매", "환불정책", "온라인 결제"],
  },
  {
    id: "labor-standards-act",
    name: "근로기준법",
    authority: "국가법령정보센터",
    url: "https://www.law.go.kr/법령/근로기준법",
    reviewIntervalDays: 30,
    affectedModules: ["근로계약", "임금·근로시간", "운영 준비"],
  },
  {
    id: "commercial-building-lease-act",
    name: "상가건물 임대차보호법",
    authority: "국가법령정보센터",
    url: "https://www.law.go.kr/법령/상가건물임대차보호법",
    reviewIntervalDays: 30,
    affectedModules: ["입지 계약", "보증금·임대료", "사업장 체크"],
  },
];

declare global {
  var __ventureLegalSnapshots: Map<string, LegalSourceSnapshot> | undefined;
}

const demoSnapshots =
  globalThis.__ventureLegalSnapshots ??
  (globalThis.__ventureLegalSnapshots = new Map());

export async function getLegalSnapshots(): Promise<LegalSourceSnapshot[]> {
  const supabase = getServerSupabase();
  if (!supabase) return [...demoSnapshots.values()].map((item) => structuredClone(item));
  const { data, error } = await supabase.from("legal_source_snapshots").select("*");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    sourceId: row.source_id,
    fingerprint: row.fingerprint,
    previousFingerprint: row.previous_fingerprint,
    status: row.status,
    httpStatus: row.http_status,
    etag: row.etag,
    lastModified: row.last_modified,
    checkedAt: row.checked_at,
    acknowledgedAt: row.acknowledged_at,
    error: row.error,
  }));
}

async function probe(
  definition: LegalSourceDefinition,
  previous: LegalSourceSnapshot | null,
): Promise<LegalSourceSnapshot> {
  try {
    let response = await fetch(definition.url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (response.status === 405 || response.status === 501) {
      response = await fetch(definition.url, {
        method: "GET",
        redirect: "follow",
        headers: { Range: "bytes=0-1023" },
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      });
      await response.body?.cancel();
    }
    const etag = response.headers.get("etag");
    const lastModified = response.headers.get("last-modified");
    const contentLength = response.headers.get("content-length");
    const fingerprint = [
      response.url,
      response.status,
      etag ?? "",
      lastModified ?? "",
      contentLength ?? "",
    ].join("|");
    const status: LegalSourceSnapshot["status"] =
      !previous?.fingerprint
        ? "baseline"
        : previous.fingerprint === fingerprint
          ? previous.status === "changed" ? "changed" : "unchanged"
          : "changed";
    return {
      sourceId: definition.id,
      fingerprint,
      previousFingerprint: previous?.fingerprint ?? null,
      status,
      httpStatus: response.status,
      etag,
      lastModified,
      checkedAt: new Date().toISOString(),
      acknowledgedAt: status === "changed" ? previous?.acknowledgedAt ?? null : previous?.acknowledgedAt ?? null,
      error: response.ok ? null : `HTTP_${response.status}`,
    };
  } catch (error) {
    return {
      sourceId: definition.id,
      fingerprint: previous?.fingerprint ?? null,
      previousFingerprint: previous?.previousFingerprint ?? null,
      status: "unavailable",
      httpStatus: null,
      etag: previous?.etag ?? null,
      lastModified: previous?.lastModified ?? null,
      checkedAt: new Date().toISOString(),
      acknowledgedAt: previous?.acknowledgedAt ?? null,
      error: error instanceof Error ? error.message : "LEGAL_SOURCE_PROBE_FAILED",
    };
  }
}

async function saveSnapshot(snapshot: LegalSourceSnapshot) {
  const supabase = getServerSupabase();
  if (!supabase) {
    demoSnapshots.set(snapshot.sourceId, structuredClone(snapshot));
    return;
  }
  const { error } = await supabase.from("legal_source_snapshots").upsert({
    source_id: snapshot.sourceId,
    fingerprint: snapshot.fingerprint,
    previous_fingerprint: snapshot.previousFingerprint,
    status: snapshot.status,
    http_status: snapshot.httpStatus,
    etag: snapshot.etag,
    last_modified: snapshot.lastModified,
    checked_at: snapshot.checkedAt,
    acknowledged_at: snapshot.acknowledgedAt,
    error: snapshot.error,
  });
  if (error) throw error;
}

export async function refreshLegalSources(): Promise<LegalSourceSnapshot[]> {
  const previous = new Map((await getLegalSnapshots()).map((item) => [item.sourceId, item]));
  const snapshots = await Promise.all(
    legalSourceRegistry.map((definition) =>
      probe(definition, previous.get(definition.id) ?? null),
    ),
  );
  await Promise.all(snapshots.map(saveSnapshot));
  return snapshots;
}

export async function acknowledgeLegalSource(sourceId: string): Promise<LegalSourceSnapshot> {
  const definition = legalSourceRegistry.find((item) => item.id === sourceId);
  if (!definition) throw new Error("LEGAL_SOURCE_NOT_FOUND");
  const current = (await getLegalSnapshots()).find((item) => item.sourceId === sourceId);
  if (!current) throw new Error("LEGAL_SNAPSHOT_NOT_FOUND");
  const acknowledged: LegalSourceSnapshot = {
    ...current,
    previousFingerprint: current.fingerprint,
    status: current.fingerprint ? "baseline" : "unavailable",
    acknowledgedAt: new Date().toISOString(),
  };
  await saveSnapshot(acknowledged);
  return acknowledged;
}
