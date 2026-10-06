import { after } from "next/server";
import { notifyPaymentComplete } from "./paid-notifications";

/*
 * 결제 완료 알림을 응답 뒤로 미룬다 — 결제 결과 화면 이동이 문자·메일(최대 6초)을 기다리지 않게.
 * after 를 쓸 수 없는 곳이면 그냥 이어서 보낸다(던지지 않는다). 중복은 notifyPaymentComplete 가 막는다.
 */
export function schedulePaymentNotice(orderId: string, firstCompletion: boolean) {
  const run = () => notifyPaymentComplete(orderId, firstCompletion).then(() => undefined, () => undefined);
  try { after(run); }
  catch { void run(); }
}
