import { ArrowLeft, ExternalLink, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { createLegalDocument, evaluatePlatformLaunchReadiness, type LegalDocumentType } from "../lib/platform-legal/domain";
import { getPlatformLegalSettings } from "../lib/platform-legal/repository";

const labels: Record<LegalDocumentType, string> = {
  business: "사업자 정보",
  privacy: "개인정보처리방침",
  ai: "인공지능·국외 처리",
  terms: "이용약관",
  refund: "취소·환불",
};

const paths: Record<LegalDocumentType, string> = {
  business: "/business-info",
  privacy: "/privacy",
  ai: "/ai-notice",
  terms: "/terms",
  refund: "/refund",
};

export async function PlatformLegalPage({ type }: { type: LegalDocumentType }) {
  const settings = await getPlatformLegalSettings();
  const document = createLegalDocument(type, settings);
  const readiness = evaluatePlatformLaunchReadiness(settings, {
    authConfigured: Boolean(process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
    paymentsConfigured: false,
  });

  return (
    <main className="platform-legal-page">
      <header className="platform-legal-header">
        <Link href="/" aria-label="오늘창업 홈"><img src="/today-startup-logo.png" alt="오늘창업" /></Link>
        <Link href="/"><ArrowLeft /> 홈으로</Link>
      </header>
      <div className="platform-legal-layout">
        <aside>
          <strong>이용 안내</strong>
          <nav>{(Object.keys(labels) as LegalDocumentType[]).map((item) => <Link className={item === type ? "active" : ""} key={item} href={paths[item]}>{labels[item]}</Link>)}</nav>
        </aside>
        <article className="platform-legal-document">
          <header>
            <span><ShieldCheck /> {readiness.ready ? "운영 정보 확인됨" : "정식 판매 준비 중"}</span>
            <h1>{document.title}</h1>
            <p>{document.summary}</p>
            <small>시행일 {document.effectiveDate || "입력 예정"}</small>
          </header>
          {!readiness.ready && <div className="platform-legal-draft"><strong>아직 유료 판매 전입니다.</strong><p>실제 대표자·사업자 정보와 OpenAI 처리 지역을 관리자가 확인하기 전에는 결제가 열리지 않습니다.</p></div>}
          {document.sections.map((section) => (
            <section key={section.title}>
              <h2>{section.title}</h2>
              {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              {section.items && <ul>{section.items.map((item) => <li key={item}>{item}</li>)}</ul>}
            </section>
          ))}
          <footer>
            <strong>기준 원문</strong>
            <div>
              <a href="https://www.law.go.kr/lsLinkCommonInfo.do?lsJoLnkSeq=1022784631" target="_blank" rel="noreferrer">전자상거래법 제13조 <ExternalLink /></a>
              <a href="https://www.law.go.kr/LSW/lsSideInfoP.do?docCls=jo&joBrNo=00&joNo=0031&lsiSeq=282791&urlMode=lsScJoRltInfoR" target="_blank" rel="noreferrer">인공지능기본법 제31조 <ExternalLink /></a>
              <a href="https://law.go.kr/LSW/lsInfoP.do?lsiSeq=283839&viewCls=lsRvsDocInfoR" target="_blank" rel="noreferrer">개인정보보호법 제28조의8 <ExternalLink /></a>
              <a href="https://m.pipc.go.kr/np/cop/bbs/selectBoardArticle.do?bbsId=BS212&mCode=C040030000&nttId=11360" target="_blank" rel="noreferrer">개인정보보호위원회 안내 <ExternalLink /></a>
              <a href="https://platform.openai.com/docs/models/default-usage-policies-by-endpoint" target="_blank" rel="noreferrer">OpenAI API 데이터 기준 <ExternalLink /></a>
              <a href="https://openai.com/policies/sub-processor-list/" target="_blank" rel="noreferrer">OpenAI 하위처리자 목록 <ExternalLink /></a>
            </div>
          </footer>
        </article>
      </div>
    </main>
  );
}
