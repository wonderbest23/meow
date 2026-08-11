import assert from "node:assert/strict";
import { llmFailureAlert } from "../lib/llm/alert";

/*
 * 경보는 '지금 고장났을 때' 울려야 하고, 평소에는 조용해야 한다.
 * 잘못 울리면 사람이 무시하게 되고, 그러면 진짜 사고를 놓친다.
 */

// 기록 테이블이 없으면 경보도 없다(설정 안내는 대시보드가 따로 한다)
assert.equal(llmFailureAlert(null), null);

// 평소 — 실패가 없거나 드물면 조용하다
assert.equal(llmFailureAlert({ last24h: 200, failed24h: 2, failed1h: 0, lastFailureAt: null }), null);

// 크레딧 소진처럼 지금 막힌 상황 — 1시간에 3건이면 우연이 아니다
const now = llmFailureAlert({ last24h: 40, failed24h: 5, failed1h: 3, lastFailureAt: "2026-08-11T00:00:00.000Z" });
assert.ok(now, "1시간 3건이면 알려야 한다");
assert.match(now!, /최근 1시간 실패 3건/);
assert.match(now!, /크레딧/, "무엇을 확인해야 하는지 알려줘야 한다");

// 간헐적이지만 심한 경우 — 24시간 실패율 20% 이상
const rate = llmFailureAlert({ last24h: 50, failed24h: 15, failed1h: 1, lastFailureAt: null });
assert.ok(rate, "실패율이 높으면 알려야 한다");
assert.match(rate!, /30%/);

/*
 * 호출이 적을 때 실패율이 튀는 것으로는 울리지 않는다.
 * 새벽에 1건 호출해 1건 실패하면 100%지만, 그것만으로 깨울 일은 아니다.
 */
assert.equal(llmFailureAlert({ last24h: 1, failed24h: 1, failed1h: 1, lastFailureAt: null }), null);
assert.equal(llmFailureAlert({ last24h: 9, failed24h: 9, failed1h: 2, lastFailureAt: null }), null);

// 다만 적은 호출이라도 1시간에 3건이면 그건 막힌 것이다
assert.ok(llmFailureAlert({ last24h: 5, failed24h: 5, failed1h: 5, lastFailureAt: null }));

console.log("llm-alert: all assertions passed");
