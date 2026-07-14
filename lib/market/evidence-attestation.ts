import { createHmac, timingSafeEqual } from "node:crypto";

type AttestableEvidence = Record<string, unknown>;

function secret() {
  const value = process.env.EVIDENCE_ATTESTATION_SECRET
    || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!value) throw new Error("EVIDENCE_ATTESTATION_SECRET_MISSING");
  return value;
}

function payload(evidence: AttestableEvidence) {
  const { attestation: _attestation, ...rest } = evidence;
  return JSON.stringify(
    Object.fromEntries(Object.entries(rest).sort(([left], [right]) => left.localeCompare(right))),
  );
}

export function signMarketEvidence(evidence: AttestableEvidence) {
  return createHmac("sha256", secret()).update(payload(evidence)).digest("hex");
}

export function verifyMarketEvidence(evidence: AttestableEvidence) {
  const provided = String(evidence.attestation ?? "");
  if (!/^[a-f0-9]{64}$/.test(provided)) return false;
  const expected = signMarketEvidence(evidence);
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

export function normalizeAttestedMarketWorkspaceInput(input: unknown) {
  if (!input || typeof input !== "object") return input;
  const workspace = input as Record<string, unknown>;
  if (!Array.isArray(workspace.evidence)) return input;
  return {
    ...workspace,
    evidence: workspace.evidence.map((raw) => {
      if (!raw || typeof raw !== "object") return raw;
      const evidence = raw as AttestableEvidence;
      if (evidence.verification !== "verified" || verifyMarketEvidence(evidence)) return evidence;
      return {
        ...evidence,
        verification: "needs_review",
        verificationMethod: "none",
        sourceExcerpt: "",
        retrievedAt: "",
        contentHash: "",
        attestation: "",
      };
    }),
  };
}
