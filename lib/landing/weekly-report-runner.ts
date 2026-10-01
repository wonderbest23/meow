import "server-only";
import { getServerSupabase } from "../persistence";
import { loadPlanState } from "../plan-builder/plan-server-store";
import { readOperatingState } from "../plan-builder/operating-records";
import { landingEmailConfiguration } from "./lead-email";
import { runWeeklyReports, weeklyReportSecret } from "./weekly-report";
import { customerSmsConfig } from "../notify/customer-sms";

/** 지난주(weekStart 부터)를 덮는 운영 기록이 하나라도 있는지 — 읽지 못하면 null */
export function operatingRecordedSince(answers: Record<string, unknown> | undefined, weekStart: string): boolean | null {
  try { return readOperatingState(answers ?? {}).periods.some((period) => period.end >= weekStart); }
  catch { return null; }
}

/** 예약 실행(5분마다)에서 부른다 — 실제 저장소·메일 설정을 묶어 runWeeklyReports 로 넘긴다 */
export async function runWeeklyReportsNow(limit = 10) {
  return runWeeklyReports({
    db: getServerSupabase(),
    config: landingEmailConfiguration(),
    sms: customerSmsConfig(),
    secret: weeklyReportSecret(),
    operatingRecorded: async (ownerHash, planId, weekStart) => {
      const plan = (await loadPlanState(ownerHash)).plans.find((item) => item.id === planId);
      return plan ? operatingRecordedSince(plan.answers, weekStart) : null;
    },
  }, limit);
}
