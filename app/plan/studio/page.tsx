"use client";

import BusinessKeyed from "../BusinessKeyed";
import Studio from "./Studio";
import StudioLoading from "./loading";

/*
 * 사업 작업실 — 주소의 사업(planId)이 바뀌면 대화 칸까지 통째로 새로 그린다(사업이 섞이지 않게).
 * 지운 사업 안내(DeletedBusinessGuard)는 여기서 한 번만 — 각 칸은 감싸기 없이 본문만 넣는다.
 */
export default function StudioPage() {
  return <BusinessKeyed adoptFirst fallback={<StudioLoading />}><Studio /></BusinessKeyed>;
}
