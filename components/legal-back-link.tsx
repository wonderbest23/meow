"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/*
 * 약관·안내 화면 위 '돌아가기' — 예전엔 늘 첫 화면('홈으로')으로 갔다. 앱에서 회원가입·결제 화면의 약관 링크를
 * 눌러 들어오면 보던 화면을 잃었다. 이 탭에 앞 화면이 있으면 그리로, 없으면(새 탭·주소로 바로 연 경우) 첫 화면으로.
 */
export function LegalBackLink() {
  const router = useRouter();
  return <Link href="/" onClick={(event) => {
    if (window.history.length > 1) {
      event.preventDefault();
      router.back();
    }
  }}><ArrowLeft /> 돌아가기</Link>;
}
