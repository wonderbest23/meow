import AppFrame from "../../AppFrame";
import Devices from "./Devices";

/* 기기 및 앱(휴대폰 계정 설정 → 기기 및 앱) — 지금 쓰는 곳 · 화면 설정(프로필 메뉴의 '화면 설정'과 같은 안내) */
export default function DevicesPage() {
  return <AppFrame title="기기 및 앱" settings="back" backHref="/plan/settings"><Devices /></AppFrame>;
}
