import { z } from "zod";

const cloudflareApiBase = "https://api.cloudflare.com/client/v4";

const hostnameInputSchema = z.string().trim().min(4).max(253);

type CloudflareCustomHostname = {
  id: string;
  hostname: string;
  status?: string;
  verification_errors?: string[];
  ownership_verification?: {
    name?: string;
    type?: string;
    value?: string;
  };
  ssl?: {
    status?: string;
    validation_records?: Array<{
      txt_name?: string;
      txt_value?: string;
      cname?: string;
      cname_target?: string;
    }>;
    validation_errors?: Array<{ message?: string }>;
  };
};

type CloudflareResponse<T> = {
  success: boolean;
  result: T;
  errors?: Array<{ code?: number; message?: string }>;
};

export type LandingDomainConnection = {
  configured: boolean;
  hostname: string;
  hostnameStatus: string;
  sslStatus: string;
  ready: boolean;
  cnameTarget: string;
  verificationRecords: Array<{ type: string; name: string; value: string }>;
  errors: string[];
};

export function normalizeLandingHostname(input: string) {
  const value = hostnameInputSchema.parse(input);
  const withoutProtocol = value.replace(/^https?:\/\//i, "").split(/[/?#]/, 1)[0];
  let hostname = "";
  try {
    hostname = new URL(`https://${withoutProtocol}`).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    throw new Error("CUSTOM_DOMAIN_INVALID");
  }
  if (!hostname.startsWith("www.")) throw new Error("CUSTOM_DOMAIN_WWW_REQUIRED");
  if (
    hostname === "www.oneulstart.com"
    || hostname.endsWith(".oneulstart.com")
    || hostname.includes("..")
    || !/^[a-z0-9.-]+$/.test(hostname)
  ) {
    throw new Error("CUSTOM_DOMAIN_INVALID");
  }
  return hostname;
}

function configuration() {
  return {
    zoneId: process.env.CLOUDFLARE_ZONE_ID?.trim() ?? "",
    apiToken: process.env.CLOUDFLARE_SAAS_API_TOKEN?.trim() ?? "",
    cnameTarget: process.env.CLOUDFLARE_SAAS_CNAME_TARGET?.trim() || "connect.oneulstart.com",
  };
}

export function cloudflareSaasConfigured() {
  const config = configuration();
  return Boolean(config.zoneId && config.apiToken && config.cnameTarget);
}

export async function checkCloudflareSaasHealth() {
  const config = configuration();
  if (!cloudflareSaasConfigured()) {
    return {
      status: "not_configured" as const,
      configured: false,
      reachable: false,
      cnameTarget: config.cnameTarget,
      message: "Cloudflare 도메인 연결 비밀키가 필요합니다.",
    };
  }
  try {
    await cloudflareRequest<CloudflareCustomHostname[]>(
      `/zones/${config.zoneId}/custom_hostnames?page=1&per_page=1`,
    );
    return {
      status: "ready" as const,
      configured: true,
      reachable: true,
      cnameTarget: config.cnameTarget,
      message: "Cloudflare 고객 도메인 API가 준비되었습니다.",
    };
  } catch (error) {
    return {
      status: "error" as const,
      configured: true,
      reachable: false,
      cnameTarget: config.cnameTarget,
      message: error instanceof Error && error.message.includes("Authentication")
        ? "Cloudflare API 토큰 권한을 다시 확인해주세요."
        : "Cloudflare 고객 도메인 API에 연결하지 못했습니다.",
    };
  }
}

async function cloudflareRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const config = configuration();
  if (!config.zoneId || !config.apiToken) throw new Error("DOMAIN_SERVICE_NOT_CONFIGURED");
  const response = await fetch(`${cloudflareApiBase}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const payload = await response.json() as CloudflareResponse<T>;
  if (!response.ok || !payload.success) {
    const detail = payload.errors?.map((error) => error.message).filter(Boolean).join(" / ");
    throw new Error(detail ? `CLOUDFLARE_DOMAIN_ERROR:${detail}` : "CLOUDFLARE_DOMAIN_ERROR");
  }
  return payload.result;
}

async function findCustomHostname(hostname: string) {
  const config = configuration();
  if (!config.zoneId) throw new Error("DOMAIN_SERVICE_NOT_CONFIGURED");
  const query = new URLSearchParams({ hostname });
  const result = await cloudflareRequest<CloudflareCustomHostname[]>(
    `/zones/${config.zoneId}/custom_hostnames?${query.toString()}`,
  );
  return result.find((item) => item.hostname.toLowerCase() === hostname.toLowerCase()) ?? null;
}

async function ensureFallbackOrigin() {
  const config = configuration();
  await cloudflareRequest<unknown>(
    `/zones/${config.zoneId}/custom_hostnames/fallback_origin`,
    {
      method: "PUT",
      body: JSON.stringify({ origin: config.cnameTarget }),
    },
  );
}

function connectionFromHostname(hostname: string, item: CloudflareCustomHostname | null): LandingDomainConnection {
  const config = configuration();
  const verificationRecords: LandingDomainConnection["verificationRecords"] = [];
  if (item?.ownership_verification?.name && item.ownership_verification.value) {
    verificationRecords.push({
      type: item.ownership_verification.type ?? "TXT",
      name: item.ownership_verification.name,
      value: item.ownership_verification.value,
    });
  }
  for (const record of item?.ssl?.validation_records ?? []) {
    const name = record.txt_name ?? record.cname ?? "";
    const value = record.txt_value ?? record.cname_target ?? "";
    if (name && value) verificationRecords.push({ type: record.txt_name ? "TXT" : "CNAME", name, value });
  }
  const errors = [
    ...(item?.verification_errors ?? []),
    ...(item?.ssl?.validation_errors ?? []).map((error) => error.message ?? "").filter(Boolean),
  ];
  return {
    configured: cloudflareSaasConfigured(),
    hostname,
    hostnameStatus: item?.status ?? "not_created",
    sslStatus: item?.ssl?.status ?? "not_created",
    ready: item?.status === "active" && item?.ssl?.status === "active",
    cnameTarget: config.cnameTarget,
    verificationRecords,
    errors,
  };
}

export async function getLandingDomainConnection(hostname: string) {
  if (!cloudflareSaasConfigured()) return connectionFromHostname(hostname, null);
  return connectionFromHostname(hostname, await findCustomHostname(hostname));
}

export async function createLandingDomainConnection(
  hostname: string,
  metadata: { siteId: string; projectId: string; slug: string },
) {
  const config = configuration();
  await ensureFallbackOrigin();
  const existing = await findCustomHostname(hostname);
  if (existing) return connectionFromHostname(hostname, existing);
  const created = await cloudflareRequest<CloudflareCustomHostname>(
    `/zones/${config.zoneId}/custom_hostnames`,
    {
      method: "POST",
      body: JSON.stringify({
        hostname,
        custom_metadata: {
          landing_site_id: metadata.siteId,
          project_id: metadata.projectId,
          slug: metadata.slug,
        },
        ssl: {
          method: "http",
          type: "dv",
          settings: { min_tls_version: "1.2" },
        },
      }),
    },
  );
  return connectionFromHostname(hostname, created);
}

export async function deleteLandingDomainConnection(hostname: string) {
  if (!cloudflareSaasConfigured()) throw new Error("DOMAIN_SERVICE_NOT_CONFIGURED");
  const config = configuration();
  const existing = await findCustomHostname(hostname);
  if (!existing) return;
  await cloudflareRequest<unknown>(
    `/zones/${config.zoneId}/custom_hostnames/${existing.id}`,
    { method: "DELETE" },
  );
}
