import { createHash } from "node:crypto";

type SbizStore = {
  bizesId?: string;
  bizesNm?: string;
  indsLclsCd?: string;
  indsLclsNm?: string;
  indsMclsCd?: string;
  indsMclsNm?: string;
  indsSclsCd?: string;
  indsSclsNm?: string;
  rdnmAdr?: string;
  lon?: string;
  lat?: string;
};

type SbizResponse = {
  body?: {
    totalCount?: number;
    items?: { item?: SbizStore[] | SbizStore };
  };
  header?: { resultCode?: string; resultMsg?: string };
};

export type NearbyStoreResult = {
  status: "ok" | "missing_key" | "error";
  totalCount: number | null;
  stores: Array<{
    id: string;
    name: string;
    category: string;
    address: string;
    longitude: number | null;
    latitude: number | null;
  }>;
  sourceName: string;
  sourceUrl: string;
  observedAt: string;
  retrievedAt: string;
  contentHash: string;
  sourceExcerpt: string;
  error?: string;
};

export async function fetchNearbyStores(input: {
  longitude: number;
  latitude: number;
  radiusMeters?: number;
  industryLargeCode?: string;
  industryMiddleCode?: string;
  industrySmallCode?: string;
}): Promise<NearbyStoreResult> {
  const serviceKey = process.env.DATA_GO_KR_API_KEY;
  const sourceUrl = "https://www.data.go.kr/data/15012005/openapi.do";
  if (!serviceKey) {
    return {
      status: "missing_key",
      totalCount: null,
      stores: [],
      sourceName: "소상공인시장진흥공단 상가(상권)정보",
      sourceUrl,
      observedAt: new Date().toISOString().slice(0, 10),
      retrievedAt: "",
      contentHash: "",
      sourceExcerpt: "",
    };
  }

  const url = new URL(
    "https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInRadius",
  );
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("cx", String(input.longitude));
  url.searchParams.set("cy", String(input.latitude));
  url.searchParams.set("radius", String(Math.min(2000, Math.max(50, input.radiusMeters ?? 500))));
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("numOfRows", "100");
  url.searchParams.set("type", "json");
  if (input.industryLargeCode) url.searchParams.set("indsLclsCd", input.industryLargeCode);
  if (input.industryMiddleCode) url.searchParams.set("indsMclsCd", input.industryMiddleCode);
  if (input.industrySmallCode) url.searchParams.set("indsSclsCd", input.industrySmallCode);

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
      next: { revalidate: 60 * 60 * 24 },
    });
    if (!response.ok) throw new Error(`SBIZ_HTTP_${response.status}`);
    const raw = await response.json() as { response?: SbizResponse };
    const payload = raw.response;
    if (payload?.header?.resultCode && payload.header.resultCode !== "00") {
      throw new Error(payload.header.resultMsg ?? `SBIZ_${payload.header.resultCode}`);
    }
    const item = payload?.body?.items?.item;
    const items = Array.isArray(item) ? item : item ? [item] : [];
    const retrievedAt = new Date().toISOString();
    return {
      status: "ok",
      totalCount: payload?.body?.totalCount ?? items.length,
      stores: items.map((store) => ({
        id: store.bizesId ?? crypto.randomUUID(),
        name: store.bizesNm ?? "상호 미상",
        category: store.indsSclsNm ?? store.indsMclsNm ?? store.indsLclsNm ?? "업종 미상",
        address: store.rdnmAdr ?? "",
        longitude: store.lon ? Number(store.lon) : null,
        latitude: store.lat ? Number(store.lat) : null,
      })),
      sourceName: "소상공인시장진흥공단 상가·상권 공식 자료",
      sourceUrl,
      observedAt: new Date().toISOString().slice(0, 10),
      retrievedAt,
      contentHash: createHash("sha256").update(JSON.stringify(raw)).digest("hex"),
      sourceExcerpt: `반경 ${Math.min(2000, Math.max(50, input.radiusMeters ?? 500))}m 전체 업소 ${payload?.body?.totalCount ?? items.length}곳, 응답 목록 ${items.length}건`,
    };
  } catch (error) {
    return {
      status: "error",
      totalCount: null,
      stores: [],
      sourceName: "소상공인시장진흥공단 상가·상권 공식 자료",
      sourceUrl,
      observedAt: new Date().toISOString().slice(0, 10),
      retrievedAt: "",
      contentHash: "",
      sourceExcerpt: "",
      error: error instanceof Error ? error.message : "상가정보 조회 실패",
    };
  }
}
