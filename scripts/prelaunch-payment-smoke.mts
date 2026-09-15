import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { assertPrelaunchTarget, PRELAUNCH_REF } from "./prelaunch-db-safety";
import { prelaunchManagement } from "./prelaunch-management";

assert.equal(process.argv[2], "--allow-prelaunch-newapp", "Explicit prelaunch DB approval is required");
const env = parseEnv(await readFile(new URL("../.env.local", import.meta.url), "utf8"));
assertPrelaunchTarget(env.SUPABASE_URL ?? "", process.argv[2]);
const query = prelaunchManagement(), run = randomUUID().slice(0, 8);
const manifest = "select count(*)::int as count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by id),'')) as hash from public.payment_orders t";
const before = await query(manifest);
// All fixture inserts, reservations and settlements are rolled back on the same connection.
await query(`begin; set local lock_timeout='5s'; set local statement_timeout='30s';
do $$ declare id1 text := 'PB-prelaunch-${run}-paid'; id2 text := 'PB-prelaunch-${run}-cancel'; raw jsonb;
begin
  insert into public.payment_orders(order_id,guest_token_hash,amount,order_name,method,status,opportunity,terms_version,terms_agreed_at,expires_at)
    values(id1,'fixture-${run}',100,'가상 검증 전용','CARD','created',jsonb_build_object('planId','fixture-${run}-1','product','plan'),'fixture',now(),now()+interval '5 minutes'),
      (id2,'fixture-${run}',100,'가상 검증 전용','CARD','created',jsonb_build_object('planId','fixture-${run}-2','product','plan'),'fixture',now(),now()+interval '5 minutes');
  if not public.claim_nicepay_plan_order(id1,id1,'sandbox') then raise exception 'FIRST_CLAIM_FAILED'; end if;
  if public.claim_nicepay_plan_order(id1,id1,'sandbox') then raise exception 'DUPLICATE_CLAIM'; end if;
  raw := jsonb_build_object('resultCode','0000','tid',id1,'orderId',id1,'amount',101,'currency','KRW','status','paid');
  begin
    perform public.settle_nicepay_plan_order(id1,id1,'sandbox',raw);
    raise exception 'MISMATCH_WAS_ACCEPTED';
  exception when raise_exception then
    if sqlerrm <> 'PAYMENT_AMOUNT_MISMATCH' then raise; end if;
  end;
  if (select status from public.payment_orders where order_id=id1) <> 'confirming' then raise exception 'MISMATCH_CHANGED_ORDER'; end if;
  raw := jsonb_set(raw,'{amount}','100');
  if public.settle_nicepay_plan_order(id1,id1,'sandbox',raw) <> 'done' then raise exception 'SETTLEMENT_FAILED'; end if;
  if public.settle_nicepay_plan_order(id1,id1,'sandbox',raw) <> 'done' then raise exception 'REPEATED_SETTLEMENT_FAILED'; end if;
  perform public.claim_nicepay_plan_order(id2,id2,'sandbox');
  raw := jsonb_build_object('resultCode','0000','tid',id2,'orderId',id2,'amount',100,'currency','KRW','status','cancelled');
  if public.settle_nicepay_plan_order(id2,id2,'sandbox',raw) <> 'canceled' then raise exception 'CANCEL_FAILED'; end if;
  begin
    perform public.settle_nicepay_plan_order(id2,id2,'sandbox',jsonb_set(raw,'{status}','"paid"'));
    raise exception 'TERMINAL_ORDER_REOPENED';
  exception when raise_exception then
    if sqlerrm <> 'PAYMENT_STATE_CONFLICT' then raise; end if;
  end;
end $$;
rollback;`, false);
const after = await query(manifest);
assert.deepEqual(after, before, "All fixture mutations must be rolled back");
const report = { projectRef: PRELAUNCH_REF, run, passed: 5, checks: ["single reservation", "amount mismatch leaves confirming", "idempotent completion", "cancellation is terminal", "all fixtures rolled back"], before, after, pgCalls: 0 };
await mkdir("artifacts/prelaunch-payment-smoke", { recursive: true });
await writeFile(`artifacts/prelaunch-payment-smoke/${run}.json`, JSON.stringify(report, null, 2), { mode: 0o600 });
console.log(JSON.stringify(report, null, 2));
