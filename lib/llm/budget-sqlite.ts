// Node-only local/development adapter. Do not import this into a Cloudflare Worker bundle.
import { DatabaseSync } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { chmodSync, existsSync, lstatSync } from "node:fs";
import { isAbsolute } from "node:path";
import type { BudgetAttempt, BudgetLease, ProviderUsage, ReserveCost } from "./budget";
import type { LLMProvider } from "./complete";

export type BudgetPrice = {
  provider: LLMProvider; model: string; source: string; checkedAt: number; expiresAt: number;
  inputMicrosPerMillion: number; outputMicrosPerMillion: number;
  maxInputTokens: number; maxOutputTokens: number;
};
type Row = { id: string; signature: string; state: string; charged: number; reserved: number; deadline: number; provider: LLMProvider; model: string; inputRate: number; outputRate: number; inputBound: number; outputBound: number; inputTokens: number | null; outputTokens: number | null; service: string };
const integer = (n: number) => Number.isSafeInteger(n) && n >= 0;
const cost = (input: number, output: number, inputRate: number, outputRate: number) => {
  if (![input,output,inputRate,outputRate].every(integer)) throw new Error("Invalid cost input");
  const value=(BigInt(input)*BigInt(inputRate)+BigInt(output)*BigInt(outputRate)+BigInt(999999))/BigInt(1000000);
  if (value>BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Cost overflow");
  return Number(value);
};

/** Shared on-disk transactions, not llm_usage analytics and not customer credits. */
export class SqliteAiBudget {
  private db: DatabaseSync;
  constructor(file: string, private prices: readonly BudgetPrice[], private now: () => number = Date.now) {
    if (!isAbsolute(file) || file.includes(":memory:") || existsSync(file) && lstatSync(file).isSymbolicLink()) throw new Error("An explicit local persistent file is required");
    this.db = new DatabaseSync(file, { timeout: 1000 });
    chmodSync(file, 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS ai_service_budgets (id TEXT PRIMARY KEY, cap INTEGER NOT NULL CHECK(cap>=0), halted INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS ai_cost_reservations (
        id TEXT PRIMARY KEY, service TEXT NOT NULL, job TEXT NOT NULL, attempt INTEGER NOT NULL,
        signature TEXT NOT NULL, state TEXT NOT NULL, reserved INTEGER NOT NULL, charged INTEGER NOT NULL,
        deadline INTEGER NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL,
        inputRate INTEGER NOT NULL, outputRate INTEGER NOT NULL, inputBound INTEGER NOT NULL, outputBound INTEGER NOT NULL,
        inputTokens INTEGER, outputTokens INTEGER, dispatchToken TEXT, priceSource TEXT NOT NULL, priceCheckedAt INTEGER NOT NULL,
        UNIQUE(service,job,attempt));`);
  }
  close() { this.db.close(); }
  private transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result=fn();this.db.exec("COMMIT");return result; }
    catch(error) { this.db.exec("ROLLBACK");throw error; }
  }
  /** Explicit provisioning only. Reopening cannot reset usage or silently raise the cap. */
  provision(service: string, capMicros: number) {
    if (!service || !integer(capMicros)) throw new Error("Explicit service budget required");
    this.transaction(()=>{
      const old=this.db.prepare("SELECT cap FROM ai_service_budgets WHERE id=?").get(service);
      if(old && old.cap!==capMicros)throw new Error("Existing budget cap cannot change implicitly");
      this.db.prepare("INSERT OR IGNORE INTO ai_service_budgets(id,cap) VALUES(?,?)").run(service,capMicros);
    });
  }
  snapshot(service: string) {
    return { budget:this.db.prepare("SELECT * FROM ai_service_budgets WHERE id=?").get(service), reservations:this.db.prepare("SELECT * FROM ai_cost_reservations WHERE service=? ORDER BY job,attempt").all(service) };
  }
  forJob(service: string, job: string): ReserveCost {
    return async attempt => this.reserve(service, job, attempt);
  }
  private reserve(service: string, job: string, attempt: BudgetAttempt): BudgetLease | false {
    const at=this.now();
    if (!job || ![0,1].includes(attempt.attempt) || !integer(attempt.inputBytes) || !integer(attempt.maxOutputTokens) || !/^[a-f0-9]{64}$/.test(attempt.requestFingerprint) || attempt.deadline<=at) return false;
    const signature=createHash("sha256").update(JSON.stringify({provider:attempt.provider,model:attempt.model,inputBytes:attempt.inputBytes,maxOutputTokens:attempt.maxOutputTokens,fingerprint:attempt.requestFingerprint})).digest("hex");
    const id=createHash("sha256").update(JSON.stringify([service,job,attempt.attempt])).digest("hex");
    const accepted=this.transaction(()=>{
      this.db.prepare("UPDATE ai_cost_reservations SET state='released',charged=0 WHERE state='reserved' AND deadline<=?").run(at);
      const budget=this.db.prepare("SELECT * FROM ai_service_budgets WHERE id=?").get(service);
      if(!budget || budget.halted) return false;
      const existing=this.db.prepare("SELECT * FROM ai_cost_reservations WHERE id=?").get(id) as Row|undefined;
      if(existing) return existing.signature===signature && existing.state==="reserved";
      const price=this.prices.find(p=>p.provider===attempt.provider && p.model===attempt.model && p.checkedAt<=at && p.expiresAt>=attempt.deadline && p.source.trim());
      if(!price || ![price.inputMicrosPerMillion,price.outputMicrosPerMillion,price.maxInputTokens,price.maxOutputTokens].every(integer))return false;
      // Text/schema bytes plus conservative message/cache framing headroom, never a cost estimate from AI.
      const inputBound=attempt.inputBytes*2+32768;
      if(!integer(inputBound) || inputBound>price.maxInputTokens || attempt.maxOutputTokens>price.maxOutputTokens)return false;
      const reserved=cost(inputBound,attempt.maxOutputTokens,price.inputMicrosPerMillion,price.outputMicrosPerMillion);
      const used=Number(this.db.prepare("SELECT COALESCE(SUM(charged),0) AS amount FROM ai_cost_reservations WHERE service=?").get(service)!.amount);
      if(reserved>Number(budget.cap)-used)return false;
      this.db.prepare("INSERT INTO ai_cost_reservations(id,service,job,attempt,signature,state,reserved,charged,deadline,provider,model,inputRate,outputRate,inputBound,outputBound,priceSource,priceCheckedAt) VALUES(?,?,?,?,?,'reserved',?,?,?,?,?,?,?,?,?,?,?)")
        .run(id,service,job,attempt.attempt,signature,reserved,reserved,attempt.deadline,attempt.provider,attempt.model,price.inputMicrosPerMillion,price.outputMicrosPerMillion,inputBound,attempt.maxOutputTokens,price.source,price.checkedAt);
      return true;
    });
    if(!accepted)return false;
    const dispatchToken=randomUUID();
    return {id,
      begin:async()=>this.transaction(()=>{
        const row=this.db.prepare("SELECT * FROM ai_cost_reservations WHERE id=?").get(id) as Row;
        if(row.state!=="reserved")return false;
        const budget=this.db.prepare("SELECT halted FROM ai_service_budgets WHERE id=?").get(row.service);
        if(!budget || budget.halted)return false;
        if(row.deadline<=this.now()){this.db.prepare("UPDATE ai_cost_reservations SET state='released',charged=0 WHERE id=?").run(id);return false;}
        this.db.prepare("UPDATE ai_cost_reservations SET state='sent',dispatchToken=? WHERE id=? AND state='reserved'").run(dispatchToken,id);return true;
      }),
      cancel:async()=>{this.transaction(()=>{this.db.prepare("UPDATE ai_cost_reservations SET state='released',charged=0 WHERE id=? AND (state='reserved' OR (state='sent' AND dispatchToken=?))").run(id,dispatchToken);});},
      settle:async usage=>{this.transaction(()=>this.settle(id,usage));},
    };
  }
  private settle(id: string, usage: ProviderUsage | null) {
    const row=this.db.prepare("SELECT * FROM ai_cost_reservations WHERE id=?").get(id) as Row;
    if(!["sent","uncertain","settled"].includes(row.state))return;
    const known=usage && usage.model===row.model && usage.provider===row.provider && integer(usage.inputTokens) && integer(usage.outputTokens);
    // An overrun is uncertain for billing, but its recorded usage is not unknown.
    if(row.inputTokens!==null && row.outputTokens!==null) {
      if(usage && (!known || row.inputTokens!==usage.inputTokens || row.outputTokens!==usage.outputTokens))throw new Error("Conflicting settlement");
      return;
    }
    if(!known){this.db.prepare("UPDATE ai_cost_reservations SET state='uncertain' WHERE id=?").run(id);return;}
    const actual=cost(usage.inputTokens,usage.outputTokens,row.inputRate,row.outputRate);
    const exceeded=usage.inputTokens>row.inputBound || usage.outputTokens>row.outputBound || actual>row.reserved;
    this.db.prepare("UPDATE ai_cost_reservations SET state=?,charged=?,inputTokens=?,outputTokens=? WHERE id=?").run(exceeded?"uncertain":"settled",exceeded?Math.max(actual,row.reserved):actual,usage.inputTokens,usage.outputTokens,id);
    if(exceeded)this.db.prepare("UPDATE ai_service_budgets SET halted=1 WHERE id=?").run(row.service);
  }
}
