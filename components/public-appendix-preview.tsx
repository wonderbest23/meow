/**
 * 공개 페이지 맨 아래에 자동으로 붙는 문의 양식·사업자 줄을 에디터·미리보기에도 보여 준다(소유자 지적 2026-10-07:
 * 에디터에 없던 '워크숍 문의하기'가 공개하면 나타나 템플릿 버그처럼 보였다). 실제 양식은 components/public-landing-client.tsx.
 * 여기서는 고칠 수 없다는 안내와 함께 모양만 보여 준다 — 손님 연락 방법은 홈페이지 화면의 '손님 연락 방법'에서 바꾼다.
 * 글은 공개 페이지(public-landing-client.tsx)와 같게 둔다 — 예전엔 미리보기에만 '신청하기' 꼬리표와 다른 안내 문장이 있었다(여정 점검 2026-10-22).
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

/** where — 'below': 홈페이지 화면(바로 아래에 '손님 연락 방법' 칸이 있다), 'editor': 편집기 안(닫은 뒤에 바꾼다) */
export function PublicAppendixPreview({ appendix, where = "below" }: { appendix: PublicAppendix; where?: "below" | "editor" }) {
  return (
    <div className="public-appendix-preview" aria-label="공개 페이지 맨 아래에 붙는 문의 양식">
      <p className="public-appendix-note">공개 페이지 맨 아래에 자동으로 붙어요 · 여기서는 고칠 수 없고, {where === "editor" ? "편집기를 닫은 뒤 ‘손님 연락 방법’에서 바꿔요" : "아래 ‘손님 연락 방법’에서 바꿔요"}</p>
      <section>
        <h2>{appendix.ctaLabel}</h2>
        {appendix.leadCaptureEnabled ? (
          <>
            <p>남겨 주시면 확인하고 연락드릴게요.</p>
            <div className="public-appendix-fields">
              <span>이름</span>
              {appendix.collectEmail && <span>이메일</span>}
              {appendix.collectPhone && <span>전화번호</span>}
              {appendix.collectMessage && <span className="tall">문의 내용</span>}
              <span className="consent">개인정보 수집·이용 동의</span>
              {/* 보내기 단추는 공개 페이지와 같은 '문의 보내기' — 양식 제목(문의 버튼 글)을 단추에 또 쓰면 같은 말이 세 번 나왔다 */}
              <b>문의 보내기</b>
            </div>
          </>
        ) : <p>사업자 연락처(전화·이메일)가 보여요.</p>}
      </section>
      {appendix.businessName ? <footer>{appendix.businessName}</footer> : null}
    </div>
  );
}
