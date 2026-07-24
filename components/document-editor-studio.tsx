"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  FileText,
  History,
  LoaderCircle,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { DeliveryItem } from "../lib/delivery/package-assembler";
import {
  inspectDocumentDraft,
  replaceDocumentSection,
  splitDocumentSections,
  type DocumentDraft,
  type DocumentDraftVersion,
} from "../lib/delivery/document-drafts";
import { DeliveryDocumentPreview } from "./delivery-document-preview";

type AssistMode = "spellcheck" | "simplify" | "concretize" | "evidence";

type AssistResult = {
  replacement: string;
  summary: string;
  warnings: string[];
};

export type DocumentQuickBlock = {
  id: string;
  label: string;
  description: string;
  markdown: string;
};

const assistLabels: Record<AssistMode, string> = {
  spellcheck: "맞춤법",
  simplify: "쉽게 쓰기",
  concretize: "더 구체적으로",
  evidence: "근거 보강",
};

export function DocumentEditorStudio({
  item,
  draft,
  projectId,
  demo,
  quickBlocks,
  onSave,
  onRestore,
  onReset,
  onClose,
}: {
  item: DeliveryItem;
  draft: DocumentDraft | undefined;
  projectId?: string;
  demo?: boolean;
  quickBlocks: DocumentQuickBlock[];
  onSave: (markdown: string, summary: string) => Promise<void>;
  onRestore: (version: DocumentDraftVersion) => Promise<void>;
  onReset: () => Promise<void>;
  onClose: () => void;
}) {
  const savedMarkdown = draft?.markdown ?? item.markdown;
  const [markdown, setMarkdown] = useState(savedMarkdown);
  const [activeIndex, setActiveIndex] = useState(0);
  const [preview, setPreview] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [checkOpen, setCheckOpen] = useState(false);
  const [busy, setBusy] = useState<"idle" | "saving" | "resetting" | AssistMode>("idle");
  const [message, setMessage] = useState("");
  const [assistResult, setAssistResult] = useState<AssistResult | null>(null);
  const sections = useMemo(() => splitDocumentSections(markdown), [markdown]);
  const activeSection = sections[Math.min(activeIndex, sections.length - 1)] ?? sections[0];
  const audit = useMemo(() => inspectDocumentDraft(markdown), [markdown]);
  const dirty = markdown.trim() !== savedMarkdown.trim();
  const selectedVersion = draft?.versions.at(-1)?.version ?? 0;

  useEffect(() => {
    setMarkdown(savedMarkdown);
    setMessage("");
    setAssistResult(null);
  }, [item.id, savedMarkdown]);

  const replaceActiveBody = (body: string) => {
    if (!activeSection) return;
    setMarkdown((current) => replaceDocumentSection(current, activeSection, body));
    setAssistResult(null);
  };

  const moveSection = (next: number) => {
    setActiveIndex(Math.max(0, Math.min(next, sections.length - 1)));
    setAssistResult(null);
    setMessage("");
    setPreview(false);
  };

  const save = async () => {
    setBusy("saving");
    setMessage("수정 내용을 저장하고 있습니다.");
    try {
      await onSave(markdown, `${activeSection?.title ?? "문서"} 수정`);
      setMessage("저장했습니다. PDF·워드와 전체 받기에도 같은 내용이 들어갑니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "수정 내용을 저장하지 못했습니다.");
    } finally {
      setBusy("idle");
    }
  };

  const reset = async () => {
    setBusy("resetting");
    setMessage("처음 만들어진 문서로 되돌리고 있습니다.");
    try {
      await onReset();
      setMessage("처음 만들어진 문서로 되돌렸습니다.");
      setHistoryOpen(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "문서를 되돌리지 못했습니다.");
    } finally {
      setBusy("idle");
    }
  };

  const restore = async (version: DocumentDraftVersion) => {
    setBusy("resetting");
    setMessage(`${version.version}차 수정본을 불러오고 있습니다.`);
    try {
      await onRestore(version);
      setHistoryOpen(false);
      setMessage(`${version.version}차 수정본으로 되돌렸습니다. 이 작업도 새 판으로 저장됩니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "이전 수정본을 불러오지 못했습니다.");
    } finally {
      setBusy("idle");
    }
  };

  const assist = async (mode: AssistMode) => {
    if (!activeSection?.body.trim()) return;
    if (demo || !projectId) {
      setMessage("예시 화면에서는 인공지능 문장 도움을 실행하지 않습니다. 내 사업 결과물에서는 연결된 인공지능으로 사용할 수 있습니다.");
      return;
    }
    setBusy(mode);
    setMessage(`${assistLabels[mode]} 제안을 만들고 있습니다.`);
    setAssistResult(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/documents/assist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          documentId: item.id,
          sectionTitle: activeSection.title,
          text: activeSection.body,
        }),
      });
      const payload = await response.json() as { result?: AssistResult; error?: { message?: string } };
      if (!response.ok || !payload.result) throw new Error(payload.error?.message ?? "문장 제안을 만들지 못했습니다.");
      setAssistResult(payload.result);
      setMessage("제안을 확인한 뒤 ‘이 문장으로 바꾸기’를 눌러주세요.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "문장 제안을 만들지 못했습니다.");
    } finally {
      setBusy("idle");
    }
  };

  const insertBlock = (block: DocumentQuickBlock) => {
    const current = activeSection?.body.trim() ?? "";
    replaceActiveBody([current, block.markdown.trim()].filter(Boolean).join("\n\n"));
    setMessage(`${block.label}을 현재 항목 아래에 넣었습니다. 내용을 확인하고 저장해주세요.`);
  };

  return <div className="document-editor-studio" role="dialog" aria-modal="true" aria-label={`${item.title} 수정`}> 
    <header className="document-editor-header">
      <div><small>결과물 수정</small><strong>{item.title}</strong><span>{selectedVersion ? `${selectedVersion}차 수정본` : "처음 만들어진 문서"}</span></div>
      <nav>
        <button className={checkOpen ? "active" : ""} onClick={() => setCheckOpen((open) => !open)}><ShieldCheck /> 최종 점검</button>
        <button className={historyOpen ? "active" : ""} onClick={() => setHistoryOpen((open) => !open)}><History /> 판 기록</button>
        <button className="document-editor-save" disabled={busy !== "idle" || !dirty} onClick={() => void save()}>{busy === "saving" ? <LoaderCircle className="spin" /> : <Save />} 저장</button>
        <button className="document-editor-close" title="문서 수정 닫기" aria-label="문서 수정 닫기" onClick={onClose}>닫기</button>
      </nav>
    </header>

    <div className="document-editor-layout">
      <aside className="document-editor-outline">
        <header><small>문서 구성</small><strong>{sections.length}개 항목</strong></header>
        <nav>{sections.map((section, index) => <button key={section.id} className={index === activeIndex ? "active" : ""} onClick={() => moveSection(index)}><span>{String(index + 1).padStart(2, "0")}</span><strong>{section.title}</strong>{index === activeIndex && <Check />}</button>)}</nav>
      </aside>

      <main className="document-editor-main">
        <div className="document-editor-mobile-section">
          <span>{activeIndex + 1} / {sections.length}</span>
          <select aria-label="수정할 문서 항목" value={activeIndex} onChange={(event) => moveSection(Number(event.target.value))}>
            {sections.map((section, index) => <option key={section.id} value={index}>{section.title}</option>)}
          </select>
          <ChevronDown />
        </div>

        <section className="document-editor-workspace">
          <header>
            <div><small>{activeIndex + 1}번째 항목</small><h2>{activeSection?.title}</h2><p>이 항목만 고치면 됩니다. 표와 목록은 모양을 유지한 채 내용만 바꿔주세요.</p></div>
            <div className="document-editor-mode"><button className={!preview ? "active" : ""} onClick={() => setPreview(false)}>내용 수정</button><button className={preview ? "active" : ""} onClick={() => setPreview(true)}>보이는 모습</button></div>
          </header>

          <div className="document-editor-assist-tools" aria-label="인공지능 문장 도움">
            <button disabled={busy !== "idle"} onClick={() => void assist("simplify")}>{busy === "simplify" ? <LoaderCircle className="spin" /> : <Sparkles />} 쉽게 쓰기</button>
            <button disabled={busy !== "idle"} onClick={() => void assist("concretize")}>{busy === "concretize" ? <LoaderCircle className="spin" /> : <CheckCircle2 />} 더 구체적으로</button>
            <button disabled={busy !== "idle"} onClick={() => void assist("spellcheck")}>{busy === "spellcheck" ? <LoaderCircle className="spin" /> : <Check />} 맞춤법</button>
            <button disabled={busy !== "idle"} onClick={() => void assist("evidence")}>{busy === "evidence" ? <LoaderCircle className="spin" /> : <Search />} 근거 보강</button>
          </div>

          {preview
            ? <div className="document-editor-rendered"><DeliveryDocumentPreview markdown={`## ${activeSection?.title ?? "문서 내용"}\n\n${activeSection?.body ?? ""}`} /></div>
            : <label className="document-editor-field"><span>현재 항목 내용</span><textarea value={activeSection?.body ?? ""} onChange={(event) => replaceActiveBody(event.target.value)} spellCheck rows={20} /></label>}

          {assistResult && <article className="document-editor-suggestion">
            <header><span><Sparkles /> 인공지능 제안</span><strong>{assistResult.summary}</strong></header>
            <div><DeliveryDocumentPreview markdown={assistResult.replacement} /></div>
            {assistResult.warnings.map((warning) => <p key={warning}>{warning}</p>)}
            <footer><button onClick={() => setAssistResult(null)}>그대로 두기</button><button onClick={() => replaceActiveBody(assistResult.replacement)}><Sparkles /> 이 문장으로 바꾸기</button></footer>
          </article>}

          {quickBlocks.length > 0 && <details className="document-editor-data-tools">
            <summary><FileText /> 저장된 자료 넣기 <ChevronDown /></summary>
            <div>{quickBlocks.map((block) => <button key={block.id} onClick={() => insertBlock(block)}><strong>{block.label}</strong><span>{block.description}</span><ArrowRight /></button>)}</div>
          </details>}
        </section>

        <footer className="document-editor-navigation">
          <button disabled={activeIndex === 0} onClick={() => moveSection(activeIndex - 1)}><ArrowLeft /> 이전 항목</button>
          <p role="status">{message || (dirty ? "수정한 내용이 아직 저장되지 않았습니다." : "저장된 내용입니다.")}</p>
          <button disabled={activeIndex === sections.length - 1} onClick={() => moveSection(activeIndex + 1)}>다음 항목 <ArrowRight /></button>
        </footer>
      </main>

      {(historyOpen || checkOpen) && <aside className="document-editor-sidepanel">
        <header><div><small>{historyOpen ? "판 기록" : "최종 점검"}</small><strong>{historyOpen ? "이전 내용으로 돌아가기" : "공유 전 확인할 내용"}</strong></div><button title="옆 화면 닫기" aria-label="옆 화면 닫기" onClick={() => { setHistoryOpen(false); setCheckOpen(false); }}>닫기</button></header>
        {historyOpen ? <div className="document-version-list">
          {draft?.versions.length ? [...draft.versions].reverse().map((version, index) => <article key={version.id} className={index === 0 ? "current" : ""}><span>{version.version}차</span><div><strong>{version.summary}</strong><small>{new Date(version.createdAt).toLocaleString("ko-KR")}</small></div>{index === 0 ? <em>현재</em> : <button disabled={busy !== "idle"} onClick={() => void restore(version)}>되돌리기</button>}</article>) : <p>아직 저장한 수정본이 없습니다.</p>}
          <button className="document-version-reset" disabled={busy !== "idle" || !draft} onClick={() => void reset()}><RotateCcw /> 처음 만들어진 문서로 되돌리기</button>
        </div> : <div className="document-quality-checks">
          <article className={audit.suspicious === 0 ? "passed" : "warning"}><span>{audit.suspicious === 0 ? <Check /> : <Search />}</span><div><strong>시험용·과장 표현</strong><p>{audit.suspicious === 0 ? "발견되지 않았습니다." : `${audit.suspicious}곳을 직접 확인하세요.`}</p></div></article>
          <article className={audit.emptySections === 0 ? "passed" : "warning"}><span>{audit.emptySections === 0 ? <Check /> : <FileText />}</span><div><strong>비어 있거나 너무 짧은 항목</strong><p>{audit.emptySections === 0 ? "모든 항목에 내용이 있습니다." : `${audit.emptySections}개 항목을 보완하세요.`}</p></div></article>
          <article className={audit.unresolved === 0 ? "passed" : "notice"}><span>{audit.unresolved === 0 ? <Check /> : <ShieldCheck />}</span><div><strong>추가 확인 표시</strong><p>{audit.unresolved === 0 ? "남은 확인 표시가 없습니다." : `${audit.unresolved}곳은 외부 공유 전에 확인하세요.`}</p></div></article>
          <article className={audit.urls > 0 ? "passed" : "notice"}><span>{audit.urls > 0 ? <Check /> : <Search />}</span><div><strong>연결된 원문 주소</strong><p>{audit.urls > 0 ? `${audit.urls}개 주소가 연결되어 있습니다.` : "시장 수치를 썼다면 공식 원문을 연결하세요."}</p></div></article>
          <div className="document-quality-result"><ShieldCheck /><span><strong>{audit.ready ? "문서 구조 점검 완료" : "확인할 항목이 남아 있습니다"}</strong><p>이 점검은 법률·세무·투자 심사를 대신하지 않습니다. 실제 수치와 계약 조건은 원문을 확인하세요.</p></span></div>
        </div>}
      </aside>}
    </div>
  </div>;
}
