"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bookmark,
  Check,
  ExternalLink,
  FileText,
  Landmark,
  LoaderCircle,
  Save,
  Sparkles,
} from "lucide-react";
import type { GrantAnalysis, GrantPackage, GrantMatch, GrantWorkspace } from "../lib/grants/domain";
import type { ProjectRecord } from "../lib/service-domain";
import { downloadBusinessDocuments } from "../lib/delivery/client-download";

const statusLabels: Record<GrantMatch["status"], string> = {
  eligible: "입력 조건상 신청 가능 후보",
  conditional: "원문·증빙 확인 필요",
  ineligible: "현재 정보상 제외",
};

export function GrantMatcherPanel({
  project,
  onSaved,
}: {
  project: ProjectRecord;
  onSaved: (project: ProjectRecord) => void;
}) {
  const [workspace, setWorkspace] = useState<GrantWorkspace | null>(project.grantWorkspace);
  const [analysis, setAnalysis] = useState<GrantAnalysis | null>(project.grantAnalysis);
  const [grantPackage, setGrantPackage] = useState<GrantPackage | null>(project.grantPackage);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const response = await fetch(`/api/projects/${project.id}/grants`, { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error?.message ?? "지원사업 정보를 불러오지 못했습니다.");
        setWorkspace(payload.workspace);
        setAnalysis(payload.analysis);
        setGrantPackage(payload.grantPackage);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "지원사업 정보를 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [project.id, project.updatedAt]);

  const topMatches = useMemo(() => analysis?.matches.slice(0, 6) ?? [], [analysis]);

  const toggleBookmark = (programId: string) => {
    if (!workspace) return;
    const exists = workspace.bookmarkedProgramIds.includes(programId);
    setWorkspace({
      ...workspace,
      bookmarkedProgramIds: exists
        ? workspace.bookmarkedProgramIds.filter((id) => id !== programId)
        : [...workspace.bookmarkedProgramIds, programId],
    });
  };

  const save = async () => {
    if (!workspace) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/projects/${project.id}/grants`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(workspace),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "지원사업 정보를 저장하지 못했습니다.");
      setWorkspace(payload.workspace);
      setAnalysis(payload.analysis);
      setGrantPackage(payload.grantPackage);
      onSaved(payload.project);
      setMessage("공고 자격 판정과 신청 초안을 갱신했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "지원사업 정보를 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const download = async () => {
    if (!grantPackage) return;
    try {
      await downloadBusinessDocuments({
        format: "docx",
        project: {
          title: project.title,
          sector: String(project.opportunity.sector ?? ""),
          model: String(project.opportunity.model ?? ""),
          customer: String(project.opportunity.customer ?? ""),
          generatedAt: grantPackage.generatedAt,
          sample: false,
        },
        documents: [{ id: "grants", title: grantPackage.title, type: "공고 자격 판정과 신청 초안", versionLabel: "서버 생성본", markdown: grantPackage.markdown }],
      });
      setMessage("지원사업 신청 초안 워드 문서를 만들었습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "지원사업 문서를 만들지 못했습니다.");
    }
  };

  if (loading || !workspace) {
    return <section className="grant-matcher-panel loading"><LoaderCircle className="spin" /><p>지원사업 공고를 불러오고 있습니다.</p></section>;
  }

  return (
    <section className="grant-matcher-panel">
      <header>
        <div><span><Landmark /></span><div><small>4단계 · 정부 지원사업 찾기</small><h3>공공지원사업 후보 탐색</h3><p>공고 목록에서 후보를 찾고, 공고 원문과 증빙이 확인될 때까지 자격을 확정하지 않습니다.</p></div></div>
        <em>{analysis ? `준비 ${analysis.readinessScore}점` : "판정 전"}</em>
      </header>
      <div className="grant-summary">
        <article><small>조건 충족 후보</small><strong>{analysis?.eligibleCount ?? 0}건</strong></article>
        <article><small>원문 검토 필요</small><strong>{analysis?.conditionalCount ?? 0}건</strong></article>
        <article><small>카탈로그 기준일</small><strong>{analysis?.catalogObservedAt ?? "—"}</strong></article>
        <article><small>북마크</small><strong>{workspace.bookmarkedProgramIds.length}건</strong></article>
      </div>
      <div className="grant-form-grid">
        <label><span>창업자 만 나이</span><input type="number" min={18} max={80} value={workspace.founderAge ?? ""} onChange={(event) => setWorkspace({ ...workspace, founderAge: event.target.value ? Number(event.target.value) : null })} placeholder="예: 32" /></label>
        <label><span>팀 규모</span><input type="number" min={1} max={100} value={workspace.teamSize} onChange={(event) => setWorkspace({ ...workspace, teamSize: Number(event.target.value) || 1 })} /></label>
        <label><span>공고일 기준 등록 상태</span><select value={workspace.registrationStatus} onChange={(event) => setWorkspace({ ...workspace, registrationStatus: event.target.value as GrantWorkspace["registrationStatus"] })}><option value="unknown">확인 전</option><option value="unregistered">개인·법인 등록 없음</option><option value="registered">개인사업자 등록</option><option value="corporation">법인 설립·등록</option></select></label>
        <label className="wide"><span>등록 상태 증빙 인터넷 주소</span><input type="url" value={workspace.registrationEvidenceUrl} onChange={(event) => setWorkspace({ ...workspace, registrationEvidenceUrl: event.target.value })} placeholder="홈택스 사실증명 파일 또는 공고가 인정하는 증빙 주소" /></label>
        <label className="wide"><span>팀·경력 증빙 인터넷 주소</span><input type="url" value={workspace.supportingEvidenceUrls[0] ?? ""} onChange={(event) => setWorkspace({ ...workspace, supportingEvidenceUrls: event.target.value ? [event.target.value] : [] })} placeholder="작업 사례, 경력증명서, 협력확약서 파일 주소" /></label>
        <label className="wide"><span>지원 목표</span><textarea value={workspace.applicationGoal} onChange={(event) => setWorkspace({ ...workspace, applicationGoal: event.target.value })} placeholder="예: 예비창업패키지로 첫 시제품 검증과 고객 인터뷰 비용을 확보하고 싶습니다." /></label>
        <label className="wide checkbox"><input type="checkbox" checked={workspace.priorGrantReceived} onChange={(event) => setWorkspace({ ...workspace, priorGrantReceived: event.target.checked })} /><span>최근 3년 내 유사 지원사업 수혜 이력이 있습니다.</span></label>
        <label className="wide checkbox"><input type="checkbox" checked={workspace.officialAnnouncementChecked} onChange={(event) => setWorkspace({ ...workspace, officialAnnouncementChecked: event.target.checked })} /><span>해당 연도 세부 공고문과 신청 마감일을 직접 확인했습니다.</span></label>
        <label className="wide checkbox"><input type="checkbox" checked={workspace.taxArrearsChecked} onChange={(event) => setWorkspace({ ...workspace, taxArrearsChecked: event.target.checked })} /><span>국세·지방세 체납 관련 요건을 확인했습니다.</span></label>
        <label className="wide checkbox"><input type="checkbox" checked={workspace.exclusionCriteriaChecked} onChange={(event) => setWorkspace({ ...workspace, exclusionCriteriaChecked: event.target.checked })} /><span>중복수혜·참여제한·제외업종 요건을 확인했습니다.</span></label>
      </div>
      <div className="grant-match-list">
        {topMatches.map((match) => (
          <article key={match.programId} className={match.status}>
            <div className="grant-match-head">
              <div><strong>{match.title}</strong><p>{match.organizer} · 탐색 우선도 {match.fitScore}</p></div>
              <div>
                <em>{statusLabels[match.status]}</em>
                <button className={workspace.bookmarkedProgramIds.includes(match.programId) ? "active" : ""} onClick={() => toggleBookmark(match.programId)}><Bookmark /></button>
                <a href={match.officialUrl} target="_blank" rel="noreferrer"><ExternalLink /></a>
              </div>
            </div>
            {match.blockers.length > 0 && <p className="grant-blockers"><AlertTriangle /> {match.blockers.join(" ")}</p>}
            {match.missingEvidence.length > 0 && <p className="grant-missing">추가 증빙: {match.missingEvidence.join(", ")}</p>}
            {match.matchedCriteria.length > 0 && <ul>{match.matchedCriteria.slice(0, 2).map((item) => <li key={item}><Check /> {item}</li>)}</ul>}
          </article>
        ))}
      </div>
      {grantPackage && (
        <details className="grant-draft-preview">
          <summary><FileText /> 신청 초안 미리보기</summary>
          <pre>{grantPackage.sections.slice(0, 2).map((section) => `# ${section.title}\n${section.paragraphs.join("\n\n")}`).join("\n\n---\n\n")}</pre>
        </details>
      )}
      {message && <p className="grant-message">{message}</p>}
      <footer>
        <div><strong>자동 자격 확정 없음</strong><span>세부 공고문과 발급 증빙을 모두 확인하기 전에는 지원 후보로만 표시합니다.</span></div>
        <button disabled={saving} onClick={save}>{saving ? <LoaderCircle className="spin" /> : <Save />} {saving ? "판정 중..." : "자격 판정 저장"}</button>
        <button disabled={!grantPackage} onClick={() => void download()}><Sparkles /> 신청 초안 워드 문서</button>
      </footer>
    </section>
  );
}
