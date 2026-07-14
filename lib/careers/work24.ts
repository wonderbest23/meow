import { XMLParser } from "fast-xml-parser";

export type Work24Career = {
  jobCode: string;
  name: string;
  classificationCode: string;
  classificationName: string;
};

export type Work24CareerSearch = {
  status: "ok" | "missing_key" | "error";
  query: string;
  total: number;
  jobs: Work24Career[];
  observedAt: string;
  sourceUrl: string;
  error?: string;
};

const endpoint = "https://www.work24.go.kr/cm/openApi/call/wk/callOpenApiSvcInfo212L01.do";
export const work24CareerApiGuide = "https://m.work24.go.kr/cm/e/a/0110/selectOpenApiSvcInfo.do?fullApiSvcId=000000000000000000000000000093";

function array<T>(value: T | T[] | undefined): T[] {
  return Array.isArray(value) ? value : value === undefined ? [] : [value];
}

export function parseWork24CareerXml(xml: string): { total: number; jobs: Work24Career[] } {
  const parsed = new XMLParser({ trimValues: true }).parse(xml) as {
    jobsList?: {
      total?: number | string;
      jobList?: Array<Record<string, unknown>> | Record<string, unknown>;
    };
  };
  const root = parsed.jobsList;
  const jobs = array(root?.jobList).map((job) => ({
    jobCode: String(job.jobCd ?? ""),
    name: String(job.jobNm ?? ""),
    classificationCode: String(job.jobClcd ?? ""),
    classificationName: String(job.jobClcdNM ?? ""),
  })).filter((job) => job.jobCode && job.name);
  return { total: Number(root?.total ?? jobs.length) || jobs.length, jobs };
}

export async function searchWork24Careers(query: string): Promise<Work24CareerSearch> {
  const keyword = query.trim().slice(0, 50);
  const observedAt = new Date().toISOString();
  const authKey = process.env.WORK24_API_KEY?.trim();
  if (!authKey) {
    return { status: "missing_key", query: keyword, total: 0, jobs: [], observedAt, sourceUrl: work24CareerApiGuide };
  }
  const url = new URL(endpoint);
  url.searchParams.set("authKey", authKey);
  url.searchParams.set("returnType", "XML");
  url.searchParams.set("target", "JOBCD");
  url.searchParams.set("srchType", "K");
  url.searchParams.set("keyword", keyword);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/xml,text/xml" },
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`WORK24_HTTP_${response.status}`);
    const result = parseWork24CareerXml(await response.text());
    return { status: "ok", query: keyword, ...result, observedAt, sourceUrl: work24CareerApiGuide };
  } catch (error) {
    return {
      status: "error",
      query: keyword,
      total: 0,
      jobs: [],
      observedAt,
      sourceUrl: work24CareerApiGuide,
      error: error instanceof Error ? error.message : "고용24 직업정보 조회 실패",
    };
  }
}
