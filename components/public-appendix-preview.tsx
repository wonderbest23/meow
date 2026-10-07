/**
 * 공개 페이지 맨 아래에 자동으로 붙는 문의 양식·사업자 줄을 에디터·미리보기에도 보여 준다(소유자 지적 2026-10-07:
 * 에디터에 없던 '워크숍 문의하기'가 공개하면 나타나 템플릿 버그처럼 보였다). 실제 양식은 components/public-landing-client.tsx.
 * 여기서는 고칠 수 없다는 안내와 함께 모양만 보여 준다 — 손님 연락 방법은 홈페이지 화면의 '손님 연락 방법'에서 바꾼다.
 */
export type PublicAppendix = { ctaLabel: string; leadCaptureEnabled: boolean; collectEmail: boolean; collectPhone: boolean; collectMessage: boolean; businessName: string };

export function appendixFromDraft(draft: Partial<PublicAppendix> & { ctaLabel?: string; businessName?: string }): PublicAppendix {
  return {
    ctaLabel: draft.ctaLabel?.trim() || "문의하기",
    leadCaptureEnabled: draft.leadCaptureEnabled ?? true,
    collectEmail: draft.collectEmail ?? true,
    collectPhone: draft.collectPhone ?? false,
    collectMessage: draft.collectMessage ?? true,
    businessName: draft.businessName?.trim() || "",
  };
}

export function PublicAppendixPreview({ appendix }: { appendix: PublicAppendix }) {
  return (
    <div className="public-appendix-preview" aria-label="공개 페이지 맨 아래에 붙는 문의 양식">
      <p className="public-appendix-note">공개 페이지 맨 아래에 자동으로 붙어요 · 여기서는 고칠 수 없고, 홈페이지 화면의 ‘손님 연락 방법’에서 바꿔요</p>
      <section>
        <small>{appendix.leadCaptureEnabled ? "신청하기" : "문의하기"}</small>
        <h2>{appendix.ctaLabel}</h2>
        {appendix.leadCaptureEnabled ? (
          <>
            <p>남겨주신 정보를 확인한 뒤 다음 절차를 안내합니다.</p>
            <div className="public-appendix-fields">
              <span>이름</span>
              {appendix.collectEmail && <span>이메일</span>}
              {appendix.collectPhone && <span>전화번호</span>}
              {appendix.collectMessage && <span className="tall">문의 내용</span>}
              <span className="consent">[필수] 개인정보 수집·이용 동의</span>
              <b>{appendix.ctaLabel}</b>
            </div>
          </>
        ) : <p>사업자 연락처(전화·이메일)가 보여요.</p>}
      </section>
      {appendix.businessName ? <footer>{appendix.businessName}</footer> : null}
    </div>
  );
}
