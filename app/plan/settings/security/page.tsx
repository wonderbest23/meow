import AppFrame from "../../AppFrame";
import Security from "./Security";

/* 보안(휴대폰 계정 설정 → 보안) — 로그아웃 · 회원 탈퇴. PC 는 내 계정 화면의 같은 행이 맡는다 */
export default function SecurityPage() {
  return <AppFrame title="보안" settings="back" backHref="/plan/settings"><Security /></AppFrame>;
}
