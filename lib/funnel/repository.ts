import { getServerSupabase } from "../persistence";
import type { FunnelEvent } from "./domain";

/*
 * 깔때기 이벤트 보관.
 *
 * 측정은 부업이다 — 저장이 실패해도 화면 쪽에는 아무 일도 없어야 한다.
 * 호출하는 쪽(route)이 catch 로 삼키므로 여기서는 그냥 던진다.
 *
 * Supabase 가 없으면(데모) 프로세스 메모리에 최근 것만 남긴다. 데모에서는
 * 지표를 볼 일이 없지만, 코드 경로가 갈라져 죽는 것보다 낫다.
 */

const memory: Array<FunnelEvent & { ownerHash: string; at: string }> = [];
const MEMORY_MAX = 500;

export async function saveFunnelEvent(ownerHash: string, input: FunnelEvent): Promise<void> {
  const supabase = getServerSupabase();
  if (!supabase) {
    memory.push({ ...input, ownerHash, at: new Date().toISOString() });
    if (memory.length > MEMORY_MAX) memory.splice(0, memory.length - MEMORY_MAX);
    return;
  }
  const { error } = await supabase.from("funnel_events").insert({
    owner_hash: ownerHash,
    event: input.event,
    meta: input.meta,
  });
  if (error) throw new Error(error.message);
}
