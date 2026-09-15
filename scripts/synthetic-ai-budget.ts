import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";

// Standard tier, conservatively including long-context/cache-write rates.
// Verified 2026-09-14: https://developers.openai.com/api/docs/pricing
const rates = { "gpt-6-astra": { input: 25, output: 75 } } as const;
export const APPROVAL_ID = "oneul-synthetic-launch-2026-09-13";
export const EXTENSION_APPROVAL_ID = "oneul-document-proposal-additional-5usd-2026-09-14";
type ExtensionApproval = { id: typeof EXTENSION_APPROVAL_ID; additionalUsd: 5 };
const callSchema = z.object({ id: z.string(), requestHash: z.string(), model: z.string(), reservedMicros: z.number().int().positive(), startedAt: z.string(), status: z.enum(["reserved", "completed", "http_failed", "uncertain"]), elapsedMs: z.number().optional(), inputTokens: z.number().optional(), outputTokens: z.number().optional() });
const ledgerSchema = z.object({ version: z.literal(1), approval: z.literal(APPROVAL_ID), limitMicros: z.number().int().positive().max(10_000_000), calls: z.array(callSchema).max(16), extensions: z.array(z.object({ id: z.literal(EXTENSION_APPROVAL_ID), additionalMicros: z.literal(5_000_000), approvedAt: z.string().datetime() }).strict()).max(1).default([]) })
  .refine(value => value.limitMicros <= 5_000_000 + value.extensions.reduce((sum, item) => sum + item.additionalMicros, 0) && value.calls.length <= 8 + value.extensions.length * 8, "Budget extension requires its explicit approval receipt");
type Ledger = z.infer<typeof ledgerSchema>;

export class SyntheticAiBudget {
  private ledger: Ledger;
  private readonly path: string;
  private readonly lock: string;
  private halted = false;
  private closed = false;
  private readonly runLimitMicros: number;
  constructor(private directory: string, approvedUsd: number, extension?: ExtensionApproval) {
    if (extension && (extension.id !== EXTENSION_APPROVAL_ID || extension.additionalUsd !== 5)) throw new Error("Unknown budget extension approval");
    if (!Number.isFinite(approvedUsd) || approvedUsd <= 0 || approvedUsd > (extension ? 10 : 5)) throw new Error("Explicit approval limit is required");
    this.runLimitMicros = Math.floor(approvedUsd * 1_000_000);
    mkdirSync(directory, { recursive: true });
    this.path = join(directory, "budget.json");
    this.lock = join(directory, "budget.lock");
    try { mkdirSync(this.lock); } catch { throw new Error("Another paid run holds the budget lock; do not remove a lock until that process has stopped"); }
    try {
      if (extension && !existsSync(this.path)) throw new Error("Preserve the original ledger before adding approval");
      this.ledger = existsSync(this.path) ? ledgerSchema.parse(JSON.parse(readFileSync(this.path, "utf8"))) : { version: 1, approval: APPROVAL_ID, limitMicros: this.runLimitMicros, calls: [], extensions: [] };
      if (extension && !this.ledger.extensions.some(item => item.id === extension.id)) {
        this.ledger.extensions.push({ id: extension.id, additionalMicros: 5_000_000, approvedAt: new Date().toISOString() });
        this.ledger.limitMicros += 5_000_000;
        this.ledger = ledgerSchema.parse(this.ledger);
      }
      this.persist();
    } catch (error) { rmSync(this.lock, { recursive: true }); throw error; }
  }
  summary() {
    const reservedMicros = this.ledger.calls.reduce((sum, call) => sum + call.reservedMicros, 0);
    const limit = Math.min(this.ledger.limitMicros, this.runLimitMicros);
    return { approval: APPROVAL_ID, extensions: structuredClone(this.ledger.extensions), authorizedLimitUsd: this.ledger.limitMicros / 1_000_000, limitUsd: limit / 1_000_000, reservedUpperBoundUsd: reservedMicros / 1_000_000, remainingReservationUsd: Math.max(0, limit - reservedMicros) / 1_000_000, calls: structuredClone(this.ledger.calls), actualBilledUsd: null };
  }
  private persist() {
    const temporary = `${this.path}.tmp`;
    const fd = openSync(temporary, "w", 0o600);
    try { writeFileSync(fd, JSON.stringify(this.ledger, null, 2)); fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(temporary, this.path);
    const directory = openSync(this.directory, "r");
    try { fsyncSync(directory); } finally { closeSync(directory); }
  }
  close() { if (!this.closed) { this.closed = true; rmSync(this.lock, { recursive: true }); } }
  wrap(transport: typeof fetch): typeof fetch {
    return async (input, init) => {
      if (this.closed || this.halted) throw new Error("Paid verification is stopped");
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url !== "https://api.openai.com/v1/responses" || init?.method !== "POST" || typeof init.body !== "string") throw new Error("Only the synthetic OpenAI Responses request is allowed");
      const raw = JSON.parse(init.body) as Record<string, unknown>;
      const allowed = new Set(["model", "store", "reasoning", "max_output_tokens", "text", "input"]);
      if (Object.keys(raw).some(key => !allowed.has(key))) throw new Error("Unexpected request features are not budgeted");
      if (!Array.isArray(raw.input) || raw.input.length !== 2 || raw.input.some(item => !item || !["system", "user"].includes(item.role) || typeof item.content !== "string")) throw new Error("Only bounded text input is allowed");
      if (typeof raw.model !== "string" || !Object.hasOwn(rates, raw.model)) throw new Error("Model pricing must be reviewed before paid verification");
      const maxOutput = Number(raw.max_output_tokens);
      if (!Number.isInteger(maxOutput) || maxOutput < 1 || maxOutput > 12000) throw new Error("Invalid output cap");
      const body = JSON.stringify({ ...raw, store: false, service_tier: "default" });
      // UTF-8 bytes overestimate text tokens; reserve additional framing/schema headroom.
      const inputBound = Buffer.byteLength(body, "utf8") + 16384;
      if (inputBound > 200000) throw new Error("Synthetic input is too large");
      const rate = rates[raw.model as keyof typeof rates];
      const reservedMicros = Math.ceil(inputBound * rate.input + maxOutput * rate.output);
      const used = this.ledger.calls.reduce((sum, call) => sum + call.reservedMicros, 0);
      if (this.ledger.calls.length >= 8 + this.ledger.extensions.length * 8 || used + reservedMicros > Math.min(this.ledger.limitMicros, this.runLimitMicros)) { this.halted = true; throw new Error("Approved cumulative AI budget would be exceeded; request was not sent"); }
      const call: Ledger["calls"][number] = { id: randomUUID(), requestHash: createHash("sha256").update(body).digest("hex"), model: raw.model, reservedMicros, startedAt: new Date().toISOString(), status: "reserved" };
      this.ledger.calls.push(call);
      this.persist(); // A timeout or process exit never returns the reservation to the budget.
      const start = Date.now();
      try {
        const timeout = AbortSignal.timeout(120000);
        const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
        const response = await transport(input, { ...init, body, signal, redirect: "error" });
        const payload = await response.clone().json().catch(() => null);
        call.status = response.ok ? "completed" : "http_failed";
        const usage = payload?.usage;
        if (Number.isInteger(usage?.input_tokens) && usage.input_tokens >= 0) call.inputTokens = usage.input_tokens;
        if (Number.isInteger(usage?.output_tokens) && usage.output_tokens >= 0) call.outputTokens = usage.output_tokens;
        if (!response.ok || (call.inputTokens ?? 0) > inputBound || (call.outputTokens ?? 0) > maxOutput) this.halted = true;
        return response;
      } catch (error) { call.status = "uncertain"; this.halted = true; throw error; }
      finally { call.elapsedMs = Date.now() - start; this.persist(); }
    };
  }
}
