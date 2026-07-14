"use client";

import { useEffect, useState } from "react";
import { BriefcaseBusiness, ExternalLink, LoaderCircle, Search } from "lucide-react";
import type { Work24CareerSearch } from "../lib/careers/work24";

export function CareerEvidencePanel({ keywords }: { keywords: string[] }) {
  const initial = keywords.find((item) => item.trim()) ?? "";
  const [query, setQuery] = useState(initial);
  const [result, setResult] = useState<Work24CareerSearch | null>(null);
  const [loading, setLoading] = useState(false);

  const search = async (value = query) => {
    const keyword = value.trim();
    if (!keyword) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/careers/search?q=${encodeURIComponent(keyword)}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "직업정보를 조회하지 못했습니다.");
      setResult(payload);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setQuery(initial);
    setResult(null);
    if (initial) void search(initial);
  }, [initial]);

  return (
    <section className="career-evidence-panel">
      <div className="career-evidence-title"><BriefcaseBusiness /><div><small>고용24 공식 직업정보</small><strong>연결 직업 확인</strong></div></div>
      <div className="career-search-row"><input value={query} onChange={(event) => setQuery(event.target.value)} maxLength={50} /><button onClick={() => void search()} disabled={loading}>{loading ? <LoaderCircle className="spin" /> : <Search />}조회</button></div>
      {result?.status === "missing_key" && <p className="career-source-status">고용24 연결키가 없어 직업명을 자동 조회하지 않았습니다. <a href={result.sourceUrl} target="_blank" rel="noreferrer">고용24 연결키 신청 안내 <ExternalLink /></a></p>}
      {result?.status === "error" && <p className="career-source-status">공식 직업정보 조회 실패: {result.error}</p>}
      {result?.status === "ok" && <div className="career-result-list">{result.jobs.slice(0, 6).map((job) => <article key={job.jobCode}><span>{job.classificationName || "분류 미상"}</span><strong>{job.name}</strong><small>직업코드 {job.jobCode}</small></article>)}{result.jobs.length === 0 && <p>고용24에서 일치하는 직업명을 찾지 못했습니다.</p>}</div>}
    </section>
  );
}
