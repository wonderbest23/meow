import { notFound } from "next/navigation";
import { DevKitPanel } from "./panel";

/*
 * 홈페이지 판(HomepageKitPanel)을 로그인·결제 없이 보는 개발용 화면 — 운영에서는 404.
 * 실제 화면(/plan/homepage)은 계정에 저장된 계획서와 결제가 있어야 열려서,
 * 머리 디자인 같은 것을 고칠 때마다 확인하기 어려웠다. /dev/hk
 */
export default function DevHomepageKit() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DevKitPanel />;
}
