import AppFrame from "../../AppFrame";
import Preferences from "./Preferences";

/* 환경설정(PC 설정 메뉴의 '알림 설정' · 휴대폰 계정 설정 → 환경설정 — 시안 lovable-mock/MPref.dc.html) */
export default function PreferencesPage() {
  return <AppFrame title="환경설정" settings="back" backHref="/plan/settings"><Preferences /></AppFrame>;
}
