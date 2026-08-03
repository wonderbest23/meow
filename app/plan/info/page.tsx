import Link from "next/link";
import { createLegalDocument, evaluatePlatformLaunchReadiness, type LegalDocumentType } from "../../../lib/platform-legal/domain";
import { paymentsEnabled } from "../../../lib/payments/config";
import { manualTransferPaymentConfigured } from "../../../lib/payments/manual-transfer";
import { getPlatformLegalSettings } from "../../../lib/platform-legal/repository";
import styles from "./PlanInfo.module.css";

export const dynamic = "force-dynamic";

/*
 * 이용 안내 — 플랜 셸 안에서 열린다.
 * 예전에는 레일의 이 항목이 /business-info로 나가서 자체 헤더와 '홈으로'가 있는
 * 바깥 페이지가 떴고, 작업하던 흐름에서 튕겨 나가는 느낌이었다.
 * 내용은 같은 고지 문서를 쓰되 셸 안에서 탭으로 오간다.
 */

const DOCS: Array<{ id: LegalDocumentType; label: string }> = [
  { id: "business", label: "사업자·통신판매 정보" },
  { id: "terms", label: "이용약관" },
  { id: "privacy", label: "개인정보처리방침" },
  { id: "ai", label: "인공지능·국외 처리" },
  { id: "refund", label: "취소·환불" },
];

const SOURCES = [
  { href: "https://www.law.go.kr/lsLinkCommonInfo.do?lsJoLnkSeq=1022784631", label: "전자상거래법 제13조" },
  { href: "https://www.law.go.kr/LSW/lsSideInfoP.do?docCls=jo&joBrNo=00&joNo=0031&lsiSeq=282791&urlMode=lsScJoRltInfoR", label: "인공지능기본법 제31조" },
  { href: "https://law.go.kr/LSW/lsInfoP.do?lsiSeq=283839&viewCls=lsRvsDocInfoR", label: "개인정보보호법 제28조의8" },
  { href: "https://m.pipc.go.kr/np/cop/bbs/selectBoardArticle.do?bbsId=BS212&mCode=C040030000&nttId=11360", label: "개인정보보호위원회 안내" },
];

function resolveDoc(raw: string | string[] | undefined): LegalDocumentType {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return DOCS.some((d) => d.id === value) ? (value as LegalDocumentType) : "business";
}

export default async function PlanInfoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const type = resolveDoc((await searchParams).doc);
  const settings = await getPlatformLegalSettings();
  const document = createLegalDocument(type, settings);
  const readiness = evaluatePlatformLaunchReadiness(settings, {
    authConfigured: Boolean(process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
    paymentsConfigured: paymentsEnabled() && manualTransferPaymentConfigured(),
  });

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <span className={styles.eyebrow}>이용 안내</span>
        <h1 className={styles.title}>{document.title}</h1>
        <p className={styles.summary}>{document.summary}</p>
        <small className={styles.effective}>시행일 {document.effectiveDate || "입력 예정"}</small>
      </div>

      <nav className={styles.tabs} aria-label="이용 안내 문서">
        {DOCS.map((doc) => (
          <Link
            key={doc.id}
            href={`/plan/info?doc=${doc.id}`}
            className={`${styles.tab} ${doc.id === type ? styles.tabOn : ""}`}
            aria-current={doc.id === type ? "page" : undefined}
          >
            {doc.label}
          </Link>
        ))}
      </nav>

      {!readiness.ready ? (
        <div className={styles.notice}>
          <strong>{readiness.siteOpen ? "사이트와 무료 체험은 정상 공개 중입니다." : "신고용 공개 정보를 준비하고 있습니다."}</strong>
          <p>통신판매업 신고번호 또는 면제 근거와 실제 운영 정보를 확인하기 전에는 유료 결제만 제한됩니다.</p>
        </div>
      ) : null}

      {document.sections.map((section) => (
        <section key={section.title} className={styles.section}>
          <h2>{section.title}</h2>
          {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          {section.items ? <ul>{section.items.map((item) => <li key={item}>{item}</li>)}</ul> : null}
        </section>
      ))}

      <div className={styles.sources}>
        <strong>기준 원문</strong>
        <div className={styles.sourceList}>
          {SOURCES.map((s) => (
            <a key={s.href} href={s.href} target="_blank" rel="noreferrer">{s.label}</a>
          ))}
        </div>
      </div>
    </div>
  );
}
