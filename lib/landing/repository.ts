import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerSupabase } from "../persistence";
import { getProject, listOwnedProjectRefs } from "../project-repository";
import { projectReadTable } from "../plan-builder/quarantine-tables";
import { landingDraftFingerprint } from "./save-contract";
import {
  ensureLandingPageData,
  landingDraftSchema,
  landingPublicationIssues,
  type LandingDraft,
  type LandingEventInput,
  type LandingLeadInput,
  type LandingLeadRecord,
  type LandingSiteRecord,
  type LandingVersion,
} from "./domain";

function parseLandingDraft(value: unknown): LandingDraft {
  return ensureLandingPageData(landingDraftSchema.parse(value));
}

async function publishedProjectAvailable(db: SupabaseClient, projectId: string) {
  const { data, error } = await db.from(projectReadTable()).select("id").eq("id", projectId).maybeSingle();
  if (error) throw new Error("LANDING_SOURCE_UNAVAILABLE");
  return Boolean(data);
}

type DemoLandingStore = {
  sites: Map<string, LandingSiteRecord>;
  projectIndex: Map<string, string>;
  slugIndex: Map<string, string>;
  leads: LandingLeadRecord[];
  events: Array<LandingEventInput & { id: string; siteId: string; createdAt: string }>;
};

declare global {
  var __ventureLandingStore: DemoLandingStore | undefined;
}

const demo: DemoLandingStore =
  globalThis.__ventureLandingStore ??
  (globalThis.__ventureLandingStore = {
    sites: new Map(),
    projectIndex: new Map(),
    slugIndex: new Map(),
    leads: [],
    events: [],
  });

function clone<T>(value: T): T {
  return structuredClone(value);
}

function metrics(pageViews: number, ctaClicks: number, leads: number) {
  return {
    pageViews,
    ctaClicks,
    leads,
    conversionRate: pageViews ? Math.round((leads / pageViews) * 1000) / 10 : 0,
  };
}

function demoWithMetrics(site: LandingSiteRecord): LandingSiteRecord {
  const pageViews = demo.events.filter(
    (event) => event.siteId === site.id && event.eventType === "page_view",
  ).length;
  const ctaClicks = demo.events.filter(
    (event) => event.siteId === site.id && event.eventType === "cta_click",
  ).length;
  const leads = demo.leads.filter((lead) => lead.siteId === site.id).length;
  return {
    ...clone(site),
    publishedSlug: site.versions.find(version => version.version === site.publishedVersion)?.config.slug ?? null,
    draft: parseLandingDraft(site.draft),
    versions: site.versions.map((version) => ({
      ...clone(version),
      config: parseLandingDraft(version.config),
    })),
    metrics: metrics(pageViews, ctaClicks, leads),
  };
}

async function mapSupabaseSite(
  supabase: SupabaseClient,
  row: Record<string, unknown>,
): Promise<LandingSiteRecord> {
  const siteId = row.id as string;
  const [
    { data: versionRows, error: versionError },
    { count: pageViews, error: pageViewError },
    { count: ctaClicks, error: ctaError },
    { count: leadCount, error: leadError },
  ] = await Promise.all([
    supabase.from("landing_versions").select("*").eq("site_id", siteId).order("version", { ascending: false }),
    supabase.from("landing_events").select("*", { count: "exact", head: true }).eq("site_id", siteId).eq("event_type", "page_view"),
    supabase.from("landing_events").select("*", { count: "exact", head: true }).eq("site_id", siteId).eq("event_type", "cta_click"),
    supabase.from("landing_leads").select("*", { count: "exact", head: true }).eq("site_id", siteId),
  ]);
  if (versionError) throw versionError;
  if (pageViewError) throw pageViewError;
  if (ctaError) throw ctaError;
  if (leadError) throw leadError;
  const versions: LandingVersion[] = (versionRows ?? []).map((version) => ({
    id: version.id,
    version: version.version,
    config: parseLandingDraft(version.config),
    createdAt: version.created_at,
    publishedAt: version.published_at,
    sourceUpdatedAt: version.source_updated_at ?? null,
  }));
  return {
    id: siteId,
    projectId: row.project_id as string,
    slug: row.slug as string,
    status: row.status as LandingSiteRecord["status"],
    draft: parseLandingDraft(row.draft),
    publishedVersion: (row.published_version as number | null) ?? null,
    publishedSlug: (row.published_slug as string | null) ?? null,
    versions,
    customDomain: (row.custom_domain as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    metrics: metrics(pageViews ?? 0, ctaClicks ?? 0, leadCount ?? 0),
  };
}

async function requireProject(projectId: string, guestTokenHash: string) {
  const project = await getProject(projectId, guestTokenHash);
  if (!project) throw new Error("PROJECT_NOT_FOUND");
  return project;
}

export async function getLandingForProject(
  projectId: string,
  guestTokenHash: string,
): Promise<LandingSiteRecord | null> {
  await requireProject(projectId, guestTokenHash);
  const supabase = getServerSupabase();
  if (!supabase) {
    const siteId = demo.projectIndex.get(projectId);
    const site = siteId ? demo.sites.get(siteId) : null;
    return site ? demoWithMetrics(site) : null;
  }
  const { data, error } = await supabase
    .from("landing_sites")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapSupabaseSite(supabase, data) : null;
}

export async function listLandingLeads(
  projectId: string,
  guestTokenHash: string,
): Promise<LandingLeadRecord[]> {
  const site = await getLandingForProject(projectId, guestTokenHash);
  if (!site) return [];
  const supabase = getServerSupabase();
  if (!supabase) {
    return demo.leads
      .filter((lead) => lead.siteId === site.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 100)
      .map(clone);
  }
  const { data, error } = await supabase
    .from("landing_leads")
    .select("*")
    .eq("site_id", site.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []).map(mapLeadRow);
}

function mapLeadRow(lead: Record<string, unknown>): LandingLeadRecord {
  return {
    id: lead.id as string,
    siteId: lead.site_id as string,
    name: lead.name as string,
    email: (lead.email as string | null) ?? "",
    phone: (lead.phone as string | null) ?? "",
    message: (lead.message as string | null) ?? "",
    privacyAgreed: lead.privacy_agreed as boolean,
    marketingAgreed: lead.marketing_agreed as boolean,
    source: lead.source as string,
    createdAt: lead.created_at as string,
    // 칸이 없으면(마이그레이션 20261006090000 전) 키 자체가 없다 — undefined 로 두어 화면이 단추를 숨긴다
    ...("handled_at" in lead ? { handledAt: (lead.handled_at as string | null) ?? null } : {}),
  } as LandingLeadRecord;
}

export type OwnerInquiry = { lead: LandingLeadRecord; projectId: string; planId: string | null; projectTitle: string; businessName: string };

/**
 * 내 문의 — 이 주인의 모든 홈페이지 문의를 한 번에(최신순, 최대 300건).
 * 예전엔 화면이 사업마다 두 번씩 불렀다(사업 8개면 16번) — 서버에서 표 세 번(프로젝트·홈페이지·문의)으로 끝낸다.
 * 이 기기에 저장된 사업만이 아니라 서버의 모든 사업을 본다.
 */
export async function listOwnerInquiries(guestTokenHash: string, limit = 300): Promise<OwnerInquiry[]> {
  const projects = await listOwnedProjectRefs(guestTokenHash);
  if (!projects.length) return [];
  const byProject = new Map(projects.map(project => [project.id, project]));
  const supabase = getServerSupabase();
  if (!supabase) {
    const sites = projects.map(project => demo.sites.get(demo.projectIndex.get(project.id) ?? "")).filter((site): site is LandingSiteRecord => Boolean(site));
    const siteById = new Map(sites.map(site => [site.id, site]));
    return demo.leads
      .filter(lead => siteById.has(lead.siteId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map(lead => {
        const site = siteById.get(lead.siteId)!;
        const project = byProject.get(site.projectId)!;
        return { lead: clone(lead), projectId: site.projectId, planId: project.planId, projectTitle: project.title, businessName: site.draft.businessName || project.title };
      });
  }
  const sites = await supabase.from("landing_sites").select("id, project_id, business_name:draft->>businessName").in("project_id", [...byProject.keys()]);
  if (sites.error) throw sites.error;
  const siteRows = (sites.data ?? []) as Array<{ id: string; project_id: string; business_name: string | null }>;
  if (!siteRows.length) return [];
  const siteById = new Map(siteRows.map(site => [site.id, site]));
  const leads = await supabase.from("landing_leads").select("*").in("site_id", [...siteById.keys()]).order("created_at", { ascending: false }).limit(limit);
  if (leads.error) throw leads.error;
  return (leads.data ?? []).map(row => {
    const lead = mapLeadRow(row as Record<string, unknown>);
    const site = siteById.get(lead.siteId)!;
    const project = byProject.get(site.project_id)!;
    return { lead, projectId: site.project_id, planId: project.planId, projectTitle: project.title, businessName: site.business_name || project.title };
  });
}

/**
 * 문의 '처리 완료' 표시·해제 — 이 프로젝트 홈페이지의 문의일 때만.
 * 주인 확인은 getLandingForProject(주인 해시로 프로젝트를 찾는다)가 한다.
 * 결과: 바뀐 처리 시각 / null(이 홈페이지의 문의가 아님) / "unsupported"(칸이 아직 없음)
 */
export async function setLandingLeadHandled(
  projectId: string,
  guestTokenHash: string,
  leadId: string,
  handled: boolean,
): Promise<{ handledAt: string | null } | null | "unsupported"> {
  const site = await getLandingForProject(projectId, guestTokenHash);
  if (!site) return null;
  const handledAt = handled ? new Date().toISOString() : null;
  const supabase = getServerSupabase();
  if (!supabase) {
    const lead = demo.leads.find((item) => item.id === leadId && item.siteId === site.id);
    if (!lead) return null;
    lead.handledAt = handledAt;
    return { handledAt };
  }
  const { data, error } = await supabase
    .from("landing_leads")
    .update({ handled_at: handledAt })
    .eq("id", leadId)
    .eq("site_id", site.id)
    .select("id, handled_at");
  if (error) {
    if (error.message?.includes("handled_at")) return "unsupported";
    throw error;
  }
  if (!data?.length) return null;
  return { handledAt: (data[0].handled_at as string | null) ?? null };
}

/**
 * 홈페이지 id·공개 여부만 — 버전 본문·지표까지 읽는 getLandingForProject 는 운영 기록 한 칸 채우기에 무겁다.
 * 호출하는 쪽이 프로젝트 주인을 이미 확인했어야 한다(findProjectIdByPlan 은 주인 해시로 찾는다).
 */
export async function landingSiteSummaryForProject(projectId: string): Promise<{ id: string; published: boolean } | null> {
  const supabase = getServerSupabase();
  if (!supabase) {
    const siteId = demo.projectIndex.get(projectId);
    const site = siteId ? demo.sites.get(siteId) : null;
    return site ? { id: site.id, published: site.publishedVersion !== null } : null;
  }
  const { data, error } = await supabase
    .from("landing_sites")
    .select("id, published_version")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) throw error;
  return data ? { id: data.id as string, published: data.published_version !== null } : null;
}

/*
 * 주간 리포트 받기 설정(landing_sites.weekly_report_opt_out, 마이그레이션 0038).
 * 칸이 없으면 null — 화면은 '준비 중'으로 보여 주고 리포트도 보내지 않는다.
 */
export async function getWeeklyReportEnabled(siteId: string): Promise<boolean | null> {
  const supabase = getServerSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.from("landing_sites").select("weekly_report_opt_out").eq("id", siteId).maybeSingle();
  if (error || !data) return null;
  return !data.weekly_report_opt_out;
}

/** 문자 알림 받을 휴대폰(마이그레이션 0039). 칸이 없으면 undefined, 비어 있으면 null */
export async function getLandingAlertPhone(siteId: string): Promise<string | null | undefined> {
  const supabase = getServerSupabase();
  if (!supabase) return undefined;
  const { data, error } = await supabase.from("landing_sites").select("alert_phone").eq("id", siteId).maybeSingle();
  if (error || !data) return undefined;
  return (data.alert_phone as string | null) ?? null;
}

/** 번호를 저장하면 동의 시각도 함께 남긴다(지우면 둘 다 지운다) */
export async function setLandingAlertPhone(siteId: string, phone: string | null): Promise<boolean> {
  const supabase = getServerSupabase();
  if (!supabase) return false;
  const { data, error } = await supabase.from("landing_sites")
    .update({ alert_phone: phone, alert_phone_agreed_at: phone ? new Date().toISOString() : null }).eq("id", siteId).select("id");
  return !error && Boolean(data?.length);
}

export async function setWeeklyReportEnabled(siteId: string, enabled: boolean): Promise<boolean> {
  const supabase = getServerSupabase();
  if (!supabase) return false;
  const { data, error } = await supabase.from("landing_sites").update({ weekly_report_opt_out: !enabled }).eq("id", siteId).select("id");
  return !error && Boolean(data?.length);
}

/** [from, to) 사이에 들어온 문의 수 — 운영 기록의 '문의' 칸을 채울 때 쓴다 */
export async function countLandingLeadsBetween(
  siteId: string,
  from: string,
  to: string,
): Promise<number> {
  const supabase = getServerSupabase();
  if (!supabase) return demo.leads.filter((lead) => lead.siteId === siteId && lead.createdAt >= from && lead.createdAt < to).length;
  const { count, error } = await supabase
    .from("landing_leads")
    .select("id", { count: "exact", head: true })
    .eq("site_id", siteId)
    .gte("created_at", from)
    .lt("created_at", to);
  if (error) throw error;
  return count ?? 0;
}

export async function saveLandingDraft(
  projectId: string,
  guestTokenHash: string,
  input: LandingDraft,
  condition?: { expectedUpdatedAt: string | null },
): Promise<LandingSiteRecord> {
  await requireProject(projectId, guestTokenHash);
  const draft = parseLandingDraft(input);
  const supabase = getServerSupabase();
  if (!supabase) {
    const slugOwner = demo.slugIndex.get(draft.slug);
    const existingId = demo.projectIndex.get(projectId);
    const existing = existingId ? demo.sites.get(existingId)! : null;
    if (condition && condition.expectedUpdatedAt !== (existing?.updatedAt ?? null)) {
      if (condition.expectedUpdatedAt && existing && landingDraftFingerprint(existing.draft) === landingDraftFingerprint(draft)) return demoWithMetrics(existing);
      throw new Error("LANDING_DRAFT_CONFLICT");
    }
    if (slugOwner && slugOwner !== existingId) throw new Error("SLUG_TAKEN");
    const now = new Date(Math.max(Date.now(), existing ? Date.parse(existing.updatedAt) + 1 : 0)).toISOString();
    if (existingId) {
      const site = demo.sites.get(existingId)!;
      demo.slugIndex.delete(site.slug);
      site.slug = draft.slug;
      site.draft = clone(draft);
      site.updatedAt = now;
      demo.slugIndex.set(draft.slug, site.id);
      return demoWithMetrics(site);
    }
    const site: LandingSiteRecord = {
      id: crypto.randomUUID(),
      projectId,
      slug: draft.slug,
      status: "draft",
      draft: clone(draft),
      publishedVersion: null,
      versions: [],
      customDomain: null,
      createdAt: now,
      updatedAt: now,
      metrics: metrics(0, 0, 0),
    };
    demo.sites.set(site.id, site);
    demo.projectIndex.set(projectId, site.id);
    demo.slugIndex.set(site.slug, site.id);
    return clone(site);
  }

  // The timestamp predicate and the write are one database operation, not a read-then-write check.
  const values = { project_id: projectId, slug: draft.slug, draft };
  const query = condition
    ? condition.expectedUpdatedAt === null
      ? supabase.from("landing_sites").insert(values)
      : supabase.from("landing_sites").update({ slug: draft.slug, draft }).eq("project_id", projectId).eq("updated_at", condition.expectedUpdatedAt)
    : supabase.from("landing_sites").upsert(
      values,
      { onConflict: "project_id" },
    );
  const { data, error } = await query.select().maybeSingle();
  if (condition && ((!error && !data) || error?.code === "23505")) {
    const existing = await getLandingForProject(projectId, guestTokenHash);
    if (existing && condition.expectedUpdatedAt && landingDraftFingerprint(existing.draft) === landingDraftFingerprint(draft)) return existing;
    if (!error || (existing && condition.expectedUpdatedAt === null)) throw new Error("LANDING_DRAFT_CONFLICT");
  }
  if (error) {
    if (error.code === "23505") throw new Error("SLUG_TAKEN");
    throw error;
  }
  if (!data) throw new Error("LANDING_DRAFT_CONFLICT");
  return mapSupabaseSite(supabase, data);
}

export async function publishLanding(
  projectId: string,
  guestTokenHash: string,
  expectedUpdatedAt?: string,
): Promise<LandingSiteRecord> {
  const site = await getLandingForProject(projectId, guestTokenHash);
  if (!site) throw new Error("LANDING_NOT_FOUND");
  const complianceIssues = landingPublicationIssues(site.draft);
  if (complianceIssues.length) {
    throw new Error(`LANDING_COMPLIANCE_BLOCKED:${complianceIssues.join(" / ")}`);
  }
  const supabase = getServerSupabase();
  const expected = expectedUpdatedAt ?? site.updatedAt;
  const current = site.versions.find(version => version.version === site.publishedVersion);
  const identical = site.status === "published" && current && landingDraftFingerprint(current.config) === landingDraftFingerprint(site.draft);
  const replay = identical && current.sourceUpdatedAt === expected;
  if (site.updatedAt !== expected && !replay) throw new Error("LANDING_DRAFT_CONFLICT");
  const now = new Date().toISOString();
  const nextVersion = (site.versions[0]?.version ?? 0) + 1;
  if (!supabase) {
    const stored = demo.sites.get(site.id)!;
    const latest = stored.versions.find(version => version.version === stored.publishedVersion);
    if (stored.status === "published" && latest?.sourceUpdatedAt === expected && landingDraftFingerprint(latest.config) === landingDraftFingerprint(stored.draft)) return demoWithMetrics(stored);
    if (stored.updatedAt !== site.updatedAt) throw new Error("LANDING_DRAFT_CONFLICT");
    if (identical) return demoWithMetrics(stored);
    const slugOwner = [...demo.sites.values()].find(item => item.id !== site.id && item.status === "published" && item.versions.find(version => version.version === item.publishedVersion)?.config.slug === stored.draft.slug);
    if (slugOwner) throw new Error("SLUG_TAKEN");
    const version: LandingVersion = {
      id: crypto.randomUUID(),
      version: nextVersion,
      config: clone(stored.draft),
      createdAt: now,
      publishedAt: now,
      sourceUpdatedAt: stored.updatedAt,
    };
    stored.versions.unshift(version);
    stored.publishedVersion = nextVersion;
    stored.status = "published";
    stored.updatedAt = new Date(Math.max(Date.now(), Date.parse(stored.updatedAt) + 1)).toISOString();
    return demoWithMetrics(stored);
  }
  const { error } = await supabase.rpc("publish_landing_snapshot", { p_project_id: projectId, p_owner_hash: guestTokenHash, p_expected_updated_at: expected });
  if (error) throw new Error(error.code === "23505" ? "SLUG_TAKEN" : error.message);
  return (await getLandingForProject(projectId, guestTokenHash))!;
}

export async function setLandingCustomDomain(
  projectId: string,
  guestTokenHash: string,
  customDomain: string | null,
): Promise<LandingSiteRecord> {
  const site = await getLandingForProject(projectId, guestTokenHash);
  if (!site) throw new Error("LANDING_NOT_FOUND");
  const normalized = customDomain?.trim().toLowerCase() || null;
  const supabase = getServerSupabase();
  if (!supabase) {
    const stored = demo.sites.get(site.id)!;
    stored.customDomain = normalized;
    stored.updatedAt = new Date().toISOString();
    return demoWithMetrics(stored);
  }
  const { error } = await supabase
    .from("landing_sites")
    .update({ custom_domain: normalized })
    .eq("id", site.id);
  if (error) {
    if (error.code === "23505") throw new Error("CUSTOM_DOMAIN_TAKEN");
    throw error;
  }
  return (await getLandingForProject(projectId, guestTokenHash))!;
}

export async function rollbackLanding(
  projectId: string,
  guestTokenHash: string,
  versionNumber: number,
  expectedUpdatedAt?: string,
): Promise<LandingSiteRecord> {
  const site = await getLandingForProject(projectId, guestTokenHash);
  if (!site) throw new Error("LANDING_NOT_FOUND");
  const target = site.versions.find((version) => version.version === versionNumber);
  if (!target) throw new Error("LANDING_VERSION_NOT_FOUND");
  const supabase = getServerSupabase();
  const expected = expectedUpdatedAt ?? site.updatedAt;
  const replay = site.status === "published" && site.publishedVersion === target.version && landingDraftFingerprint(site.draft) === landingDraftFingerprint(target.config);
  if (site.updatedAt !== expected && !replay) throw new Error("LANDING_DRAFT_CONFLICT");
  if (!supabase) {
    const stored = demo.sites.get(site.id)!;
    if (stored.updatedAt !== site.updatedAt) throw new Error("LANDING_DRAFT_CONFLICT");
    if (replay) return demoWithMetrics(stored);
    const slugOwner = demo.slugIndex.get(target.config.slug);
    const publicOwner = [...demo.sites.values()].find(item => item.id !== site.id && item.status === "published" && item.versions.find(version => version.version === item.publishedVersion)?.config.slug === target.config.slug);
    if ((slugOwner && slugOwner !== site.id) || publicOwner) throw new Error("SLUG_TAKEN");
    demo.slugIndex.delete(stored.slug);
    stored.draft = clone(target.config);
    stored.slug = target.config.slug;
    stored.publishedVersion = target.version;
    stored.status = "published";
    stored.updatedAt = new Date(Math.max(Date.now(), Date.parse(stored.updatedAt) + 1)).toISOString();
    demo.slugIndex.set(stored.slug, stored.id);
    return demoWithMetrics(stored);
  }
  const { error } = await supabase.rpc("rollback_landing_snapshot", { p_project_id: projectId, p_owner_hash: guestTokenHash, p_version: versionNumber, p_expected_updated_at: expected });
  if (error) {
    if (error.code === "23505") throw new Error("SLUG_TAKEN");
    throw new Error(error.message);
  }
  return (await getLandingForProject(projectId, guestTokenHash))!;
}

export async function getPublishedLandingBySlug(
  slug: string,
): Promise<{ site: LandingSiteRecord; config: LandingDraft } | null> {
  const supabase = getServerSupabase();
  if (!supabase) {
    const site = [...demo.sites.values()].find(item => item.status === "published" && item.versions.find(version => version.version === item.publishedVersion)?.config.slug === slug);
    if (!site || site.status !== "published" || site.publishedVersion === null) return null;
    const version = site.versions.find((item) => item.version === site.publishedVersion);
    return version ? { site: demoWithMetrics(site), config: clone(version.config) } : null;
  }
  const { data, error } = await supabase
    .from("landing_sites")
    .select("*")
    .eq("published_slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (error) throw error;
  if (!data || data.published_version === null) return null;
  if (!await publishedProjectAvailable(supabase, data.project_id)) return null;
  const { data: version, error: versionError } = await supabase
    .from("landing_versions")
    .select("*")
    .eq("site_id", data.id)
    .eq("version", data.published_version)
    .single();
  if (versionError) throw versionError;
  return {
    site: await mapSupabaseSite(supabase, data),
    config: parseLandingDraft(version.config),
  };
}

export async function getPublishedLandingByCustomDomain(
  hostname: string,
): Promise<{ site: LandingSiteRecord; config: LandingDraft } | null> {
  const normalized = hostname.trim().toLowerCase().replace(/:\d+$/, "");
  const supabase = getServerSupabase();
  if (!supabase) {
    const site = [...demo.sites.values()].find(
      (item) => item.customDomain === normalized && item.status === "published",
    );
    if (!site || site.publishedVersion === null) return null;
    const version = site.versions.find((item) => item.version === site.publishedVersion);
    return version ? { site: demoWithMetrics(site), config: clone(version.config) } : null;
  }
  const { data, error } = await supabase
    .from("landing_sites")
    .select("*")
    .eq("custom_domain", normalized)
    .eq("status", "published")
    .maybeSingle();
  if (error) throw error;
  if (!data || data.published_version === null) return null;
  if (!await publishedProjectAvailable(supabase, data.project_id)) return null;
  const { data: version, error: versionError } = await supabase
    .from("landing_versions")
    .select("*")
    .eq("site_id", data.id)
    .eq("version", data.published_version)
    .single();
  if (versionError) throw versionError;
  return {
    site: await mapSupabaseSite(supabase, data),
    config: parseLandingDraft(version.config),
  };
}

export async function createLandingLead(
  siteId: string,
  input: LandingLeadInput,
): Promise<LandingLeadRecord> {
  const now = new Date().toISOString();
  const supabase = getServerSupabase();
  if (!supabase) {
    const record: LandingLeadRecord = {
      ...clone(input),
      id: crypto.randomUUID(),
      siteId,
      createdAt: now,
      handledAt: null,
    };
    demo.leads.push(record);
    return clone(record);
  }
  const { data, error } = await supabase
    .from("landing_leads")
    .insert({
      site_id: siteId,
      name: input.name,
      email: input.email || null,
      phone: input.phone || null,
      message: input.message,
      privacy_agreed: input.privacyAgreed,
      marketing_agreed: input.marketingAgreed,
      source: input.source,
    })
    .select()
    .single();
  if (error) throw error;
  return {
    id: data.id,
    siteId: data.site_id,
    name: data.name,
    email: data.email ?? "",
    phone: data.phone ?? "",
    message: data.message ?? "",
    privacyAgreed: data.privacy_agreed,
    marketingAgreed: data.marketing_agreed,
    source: data.source,
    createdAt: data.created_at,
  };
}

export async function recordLandingEvent(siteId: string, input: LandingEventInput) {
  const supabase = getServerSupabase();
  if (!supabase) {
    demo.events.push({
      ...clone(input),
      id: crypto.randomUUID(),
      siteId,
      createdAt: new Date().toISOString(),
    });
    return;
  }
  const { error } = await supabase.from("landing_events").insert({
    site_id: siteId,
    event_type: input.eventType,
    visitor_id: input.visitorId,
    path: input.path,
    referrer: input.referrer,
  });
  if (error) throw error;
}
