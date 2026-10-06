import { z } from "zod";
import { normalizeMobilePhone } from "../contact-links";
import { findService } from "./catalog";

/*
 * 서비스 신청 — 화면·API·어드민이 함께 쓰는 모양과 검사.
 * 저장은 request-store.ts(서버 전용)가 맡는다. 여기는 브라우저에서도 불러 쓸 수 있게 DB 를 모른다.
 */

export const SERVICE_REQUEST_STATUSES = ["received", "contacted", "done", "canceled"] as const;
export type ServiceRequestStatus = (typeof SERVICE_REQUEST_STATUSES)[number];

export const SERVICE_REQUEST_STATUS_LABELS: Record<ServiceRequestStatus, string> = {
  received: "접수됨",
  contacted: "연락드렸어요",
  done: "완료",
  canceled: "취소",
};

/* 어드민이 고를 수 있는 다음 상태 — 끝난(완료·취소) 건은 '접수됨'으로만 되돌린다 */
export const SERVICE_REQUEST_NEXT: Record<ServiceRequestStatus, ServiceRequestStatus[]> = {
  received: ["contacted", "done", "canceled"],
  contacted: ["done", "canceled", "received"],
  done: ["received"],
  canceled: ["received"],
};

export interface ServiceRequestRecord {
  id: string;
  ownerId: string;
  planId: string;
  /** 신청할 때의 사업 이름 — 어드민이 사업 목록을 따로 열지 않고 알아보게 */
  planTitle: string;
  /** 신청한 계정 이메일 — 어드민 연락용, 사장님 화면에는 보내지 않는다 */
  customerEmail: string;
  serviceId: string;
  phone: string;
  memo: string;
  preferredTime: string;
  status: ServiceRequestStatus;
  createdAt: string;
  updatedAt: string;
}

/** 사장님 화면에 돌려주는 모양 — 주인 id 는 뺀다 */
export type MyServiceRequest = Omit<ServiceRequestRecord, "ownerId" | "customerEmail">;

export const serviceRequestInputSchema = z.object({
  planId: z.string().trim().min(1).max(100),
  serviceId: z.string().trim().min(1).max(60),
  phone: z.string().trim().max(30),
  preferredTime: z.string().trim().max(100).default(""),
  memo: z.string().trim().max(1000).default(""),
}).strict();

export type ServiceRequestInput = { planId: string; serviceId: string; phone: string; preferredTime: string; memo: string };

export type ServiceRequestValidation =
  | { ok: true; value: ServiceRequestInput }
  | { ok: false; code: "INVALID_REQUEST" | "SERVICE_NOT_FOUND" | "PHONE_INVALID"; message: string };

/** 서버가 믿는 유일한 검사 — 없는 서비스·이상한 번호는 저장 전에 돌려보낸다. 번호는 숫자만 남긴다 */
export function validateServiceRequest(body: unknown): ServiceRequestValidation {
  const parsed = serviceRequestInputSchema.safeParse(body);
  if (!parsed.success) return { ok: false, code: "INVALID_REQUEST", message: "신청 내용을 확인해 주세요." };
  if (!findService(parsed.data.serviceId)) return { ok: false, code: "SERVICE_NOT_FOUND", message: "없는 서비스예요. 새로고침 후 다시 골라 주세요." };
  const phone = normalizeMobilePhone(parsed.data.phone);
  if (!phone) return { ok: false, code: "PHONE_INVALID", message: "010으로 시작하는 휴대폰 번호를 넣어 주세요." };
  return { ok: true, value: { ...parsed.data, phone } };
}

export function isServiceRequestStatus(value: unknown): value is ServiceRequestStatus {
  return typeof value === "string" && (SERVICE_REQUEST_STATUSES as readonly string[]).includes(value);
}

export function canMoveServiceRequest(from: ServiceRequestStatus, to: ServiceRequestStatus): boolean {
  return SERVICE_REQUEST_NEXT[from].includes(to);
}
