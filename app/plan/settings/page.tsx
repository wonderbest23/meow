import AppFrame from "../AppFrame";
import SettingsIndex from "./SettingsIndex";

/* 계정 설정 목록(휴대폰 프로필 시트의 '계정 설정' — 시안 lovable-mock/MSettings.dc.html) */
export default function SettingsPage() {
  return <AppFrame title="계정 설정" settings="close"><SettingsIndex /></AppFrame>;
}
