import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerSupabase } from "../persistence";
import { getProject } from "../project-repository";
import {
  landingDraftSchema,
  landingPublicationIssues,
  type LandingDraft,
  type LandingEventInput,
  type LandingLeadInput,
  type LandingLeadRecord,
  type LandingSiteRecord,
  type LandingVersion,
} from "./domain";

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
    draft: landingDraftSchema.parse(site.draft),
    versions: site.versions.map((version) => ({
      ...clone(version),
      config: landingDraftSchema.parse(version.config),
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
    config: landingDraftSchema.parse(version.config),
    createdAt: version.created_at,
    publishedAt: version.published_at,
  }));
  return {
    id: siteId,
    projectId: row.project_id as string,
    slug: row.slug as string,
    status: row.status as LandingSiteRecord["status"],
    draft: landingDraftSchema.parse(row.draft),
    publishedVersion: (row.published_version as number | null) ?? null,
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
  return (data ?? []).map((lead) => ({
    id: lead.id,
    siteId: lead.site_id,
    name: lead.name,
    email: lead.email ?? "",
    phone: lead.phone ?? "",
    message: lead.message ?? "",
    privacyAgreed: lead.privacy_agreed,
    marketingAgreed: lead.marketing_agreed,
    source: lead.source,
    createdAt: lead.created_at,
  }));
}

export async function saveLandingDraft(
  projectId: string,
  guestTokenHash: string,
  input: LandingDraft,
): Promise<LandingSiteRecord> {
  await requireProject(projectId, guestTokenHash);
  const draft = landingDraftSchema.parse(input);
  const supabase = getServerSupabase();
  if (!supabase) {
    const slugOwner = demo.slugIndex.get(draft.slug);
    const existingId = demo.projectIndex.get(projectId);
    if (slugOwner && slugOwner !== existingId) throw new Error("SLUG_TAKEN");
    const now = new Date().toISOString();
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

  const { data, error } = await supabase
    .from("landing_sites")
    .upsert(
      { project_id: projectId, slug: draft.slug, draft },
      { onConflict: "project_id" },
    )
    .select()
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("SLUG_TAKEN");
    throw error;
  }
  return mapSupabaseSite(supabase, data);
}

export async function publishLanding(
  projectId: string,
  guestTokenHash: string,
): Promise<LandingSiteRecord> {
  const site = await getLandingForProject(projectId, guestTokenHash);
  if (!site) throw new Error("LANDING_NOT_FOUND");
  const complianceIssues = landingPublicationIssues(site.draft);
  if (complianceIssues.length) {
    throw new Error(`LANDING_COMPLIANCE_BLOCKED:${complianceIssues.join(" / ")}`);
  }
  const supabase = getServerSupabase();
  const now = new Date().toISOString();
  const nextVersion = (site.versions[0]?.version ?? 0) + 1;
  if (!supabase) {
    const stored = demo.sites.get(site.id)!;
    const version: LandingVersion = {
      id: crypto.randomUUID(),
      version: nextVersion,
      config: clone(stored.draft),
      createdAt: now,
      publishedAt: now,
    };
    stored.versions.unshift(version);
    stored.publishedVersion = nextVersion;
    stored.status = "published";
    stored.updatedAt = now;
    return demoWithMetrics(stored);
  }
  const { error: versionError } = await supabase.from("landing_versions").insert({
    site_id: site.id,
    version: nextVersion,
    config: site.draft,
    published_at: now,
  });
  if (versionError) throw versionError;
  const { error } = await supabase
    .from("landing_sites")
    .update({ status: "published", published_version: nextVersion })
    .eq("id", site.id);
  if (error) throw error;
  return (await getLandingForProject(projectId, guestTokenHash))!;
}

export async function rollbackLanding(
  projectId: string,
  guestTokenHash: string,
  versionNumber: number,
): Promise<LandingSiteRecord> {
  const site = await getLandingForProject(projectId, guestTokenHash);
  if (!site) throw new Error("LANDING_NOT_FOUND");
  const target = site.versions.find((version) => version.version === versionNumber);
  if (!target) throw new Error("LANDING_VERSION_NOT_FOUND");
  const supabase = getServerSupabase();
  if (!supabase) {
    const stored = demo.sites.get(site.id)!;
    demo.slugIndex.delete(stored.slug);
    stored.draft = clone(target.config);
    stored.slug = target.config.slug;
    stored.publishedVersion = target.version;
    stored.status = "published";
    stored.updatedAt = new Date().toISOString();
    demo.slugIndex.set(stored.slug, stored.id);
    return demoWithMetrics(stored);
  }
  const { error } = await supabase
    .from("landing_sites")
    .update({
      slug: target.config.slug,
      draft: target.config,
      published_version: target.version,
      status: "published",
    })
    .eq("id", site.id);
  if (error) {
    if (error.code === "23505") throw new Error("SLUG_TAKEN");
    throw error;
  }
  return (await getLandingForProject(projectId, guestTokenHash))!;
}

export async function getPublishedLandingBySlug(
  slug: string,
): Promise<{ site: LandingSiteRecord; config: LandingDraft } | null> {
  const supabase = getServerSupabase();
  if (!supabase) {
    const siteId = demo.slugIndex.get(slug);
    const site = siteId ? demo.sites.get(siteId) : null;
    if (!site || site.status !== "published" || site.publishedVersion === null) return null;
    const version = site.versions.find((item) => item.version === site.publishedVersion);
    return version ? { site: demoWithMetrics(site), config: clone(version.config) } : null;
  }
  const { data, error } = await supabase
    .from("landing_sites")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (error) throw error;
  if (!data || data.published_version === null) return null;
  const { data: version, error: versionError } = await supabase
    .from("landing_versions")
    .select("*")
    .eq("site_id", data.id)
    .eq("version", data.published_version)
    .single();
  if (versionError) throw versionError;
  return {
    site: await mapSupabaseSite(supabase, data),
    config: landingDraftSchema.parse(version.config),
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
