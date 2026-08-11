/*
 * AI 호출 실패 경보 판단.
 *
 * 7일 누적만 보면 '지금 고장났는지'를 알 수 없다 — 크레딧이 방금
 * 떨어져도 7일 숫자에 묻힌다. 최근 창을 따로 본다.
 *
 * 화면에서 떼어내 규칙만 검증할 수 있게 한다(잘못 울리면 무시하게 된다).
 */

export interface LlmUsageStats {
  last24h: number;
  failed24h: number;
  failed1h: number;
  lastFailureAt: string | null;
}

export function llmFailureAlert(stats: LlmUsageStats | null): string | null {
  if (!stats) return null;
  const when = stats.lastFailureAt ? new Date(stats.lastFailureAt).toLocaleString("ko-KR") : null;

  // 지금 무언가 막혀 있다 — 한 시간 안에 세 번이면 우연이 아니다
  if (stats.failed1h >= 3) {
    return `최근 1시간 실패 ${stats.failed1h}건${when ? ` · 마지막 ${when}` : ""} — Anthropic 크레딧과 키를 확인해 주세요.`;
  }

  /*
   * 간헐적이지만 심한 경우. 호출 수가 적을 때는 실패율이 쉽게 튀므로
   * 최소 10건 이상일 때만 본다(1건 중 1건 실패로 경보가 울리면 안 된다).
   */
  const rate = stats.last24h > 0 ? Math.round((stats.failed24h / stats.last24h) * 100) : 0;
  if (stats.last24h >= 10 && rate >= 20) {
    return `최근 24시간 실패율 ${rate}% (${stats.failed24h}/${stats.last24h})${when ? ` · 마지막 ${when}` : ""}`;
  }
  return null;
}
