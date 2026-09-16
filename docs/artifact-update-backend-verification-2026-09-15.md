# Cross-artifact update backend verification

## Scope and safety

- Repository: `/Users/juhong/Developer/meow-main`.
- Existing dirty changes were preserved. No commit, deployment, remote migration, paid AI call, or feature-flag activation was performed.
- Database tests use exported `localCredentials()` and the guarded local Supabase at `127.0.0.1:55431` / `55432`; credentials are neither printed nor written into an env file.
- `0032_artifact_updates.sql` remains unchanged after local application. The additive `0035_artifact_resume_limits.sql` was also applied locally. Parent/other agents own migration 0034.

## Reachable behavior

- `/api/plan/artifact-updates` provides authenticated preview/status/list and generate, resume, cancel, approve, and homepage-only apply commands.
- `WorkspaceContent` exposes `ArtifactUpdatePanel`. Changes require explicit per-item decisions; locked sections cannot be replaced.
- Jobs are stored separately from a saved proposal. Document-only updates therefore work without a PPT.
- Owner identity, source/artifact versions, consent hashes, idempotency IDs, durable claims, checkpoints, usage, and bounded input/output/call/time reservations are enforced server-side.
- Generation chunks are at most three document sections or four PPT slides, across all 11 sector / 5 purpose combinations. Existing B2B and six-slide restrictions were removed.
- Approval updates canonical sections, saved PPT, and an optional linked homepage draft in one owner-scoped CAS transaction. Public homepage versions and published pointers are never changed.
- Manual text replacements require approval; retained image/layout/chart edits are preserved. Retained stale content remains stale. Unaffected `staleItems` and dependency metadata survive later approvals.
- Expired in-flight claims become `outcome_unknown` and cannot be reissued by resume. Earlier completed checkpoints and reserved budgets survive supported retries.
- New reservations enforce owner concurrency 2, owner daily 12, plan daily 6, and plan history 30. Migration 0035 also enforces owner concurrency and same-plan pending-review exclusion when a failed job re-enters the queue.
- POST Origin validation uses the request Host, not Next's internal hostname. Foreign origins remain rejected.

## Verification results

All AI responses in these tests are mocked. Paid calls: **0**.

| Command | Result |
| --- | --- |
| `node --import tsx scripts/artifact-updates.test.ts` | 14 scenarios passed |
| `node --import tsx scripts/local-artifact-updates.test.mts` | Local SQL + authenticated HTTP + real browser approval/reload/reconnect passed |
| `node --import tsx scripts/artifact-update-matrix.test.ts` | 55 combinations passed, 352 mock chunk calls; no more-than-six-page restriction; bounded calls checked before invocation |
| `node --import tsx scripts/artifact-update-reservations.test.ts` | 7 reservation/resume checks passed in memory |
| `node --import tsx scripts/artifact-update-reservations.test.ts --local` | Same 7 checks passed against actual local SQL |
| `node --import tsx scripts/artifact-v3-operating.test.ts` | 8 V3/operating checks passed; also passed using the reliability runner's dynamic-import entry pattern |
| `node --import tsx scripts/local-artifact-v3-operating.test.mts` | Actual local SQL: 8 V3/operating checks + 7 migration-0035 reservation checks passed; exactly one V3 job seeded/applied |
| `node --import tsx scripts/proposal-rewrite.test.ts` | Passed |
| `node --import tsx scripts/proposal-business.test.ts` | Passed |
| `node --import tsx scripts/document-refresh.test.ts` | Passed; keep intentionally retains old source revision |
| `node --import tsx scripts/proposal-background.test.ts` | Passed with network mocked |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | Passed after fixing the test-only dynamic `.mts` loader |

The local integration test covers:

1. The same 14 domain/service scenarios on real Supabase persistence.
2. Direct SQL late-homepage CAS failure rolling back both the plan update and job revision.
3. Denied anon table access and transactional RPC access.
4. Real local account login; missing login 401, foreign plan 404, missing entitlement 402, foreign Origin 403.
5. Public AI creation stays 503 with flags disabled; owner hash, snapshots, and claim tokens are redacted.
6. Browser per-item approval, atomic persisted changes, identical-request replay, page reload, and fresh browser-session reconnect.
7. Panel overflow checks and screenshots at 320, 390, 768, and 1440px. This is not a broad visual-quality score.

The reliability runner now sets the direct-entry argument for the reusable artifact test modules, so dynamic importing does not silently skip their tests. The new reservation suite is registered. No claim is made here about a subsequent full-suite run by the parent.

Latest successful local browser evidence: `/private/tmp/oneul-artifact-update-1789484350414` (screenshots `artifact-panel-{320,390,768,1440}.png`). This run used a copied application snapshot and completed with exit code 0. The parent's subsequent V3 page/sourceId projection edits may postdate that snapshot and are not claimed covered by this browser run.

Follow-up on 2026-09-16: the reusable `runArtifactV3OperatingTests()` was executed against the real local database without automatic import-time seeding or demo-env overrides. The harness verified period-only document invalidation, stable metric IDs/units, missing-cost preservation, operating data reaching the generator, copied/new/deleted page projection, independent page approval, manual text/layout preservation, and kept-page staleness after persisted reload. It also reran migration-0035 limits. Both the harness and `tsc --noEmit --incremental false` exited 0. This follow-up did not start an API/browser server, change domain code, apply a new migration, or call paid AI.

## Files owned or integrated in this subtask

- `lib/plan-builder/artifact-updates.ts`
- `lib/plan-builder/artifact-update-source.ts` (parent subsequently extended operating metric/provenance handling)
- `lib/plan-builder/artifact-update-store.ts`
- `lib/plan-builder/artifact-update-service.ts` (parent subsequently extended operating context payload)
- `app/api/plan/artifact-updates/route.ts`
- `app/plan/workspace/ArtifactUpdatePanel.tsx`
- `app/plan/workspace/ArtifactUpdatePanel.module.css`
- `app/plan/workspace/WorkspaceContent.tsx` (panel hook only)
- `lib/plan-builder/proposal-rewrite.ts`
- `lib/plan-builder/proposal-rewrite-service.ts`
- `lib/plan-builder/document-refresh.ts`
- `lib/plan-builder/document-refresh-service.ts`
- `lib/plan-builder/document-refresh-runtime.ts`
- `lib/plan-builder/section-service.ts`
- `lib/plan-builder/section-workflow.ts`
- `lib/plan-builder/plan-server-store.ts`
- `supabase/migrations/0032_artifact_updates.sql`
- `supabase/migrations/0035_artifact_resume_limits.sql`
- `scripts/artifact-updates.test.ts`
- `scripts/artifact-update-matrix.test.ts`
- `scripts/artifact-update-reservations.test.ts`
- `scripts/local-artifact-updates.test.mts`
- `scripts/artifact-v3-operating.test.ts` (parent-authored scenarios; exported runner and entry guards added here)
- `scripts/local-artifact-v3-operating.test.mts`
- `scripts/proposal-rewrite-fixture.ts` (parameterized actual sector/purpose fixture)
- `scripts/document-refresh.test.ts` (intentional keep/stale behavior)
- `scripts/reliability-tests.mts` (suite registration/direct-entry invocation)

`proposal-background.ts` required no additional direct change; its existing dispatch/runtime regression test was rerun. Proposal editor/revision/scene/deck-plan and DocumentWorkspace were not edited by this subtask.

## Remaining gates and conservative behavior

- Remote Workflow dispatch/recovery, remote account claim, Google login, real PG authorization, and real paid AI generation have not been validated by these tests. The generation flag remains off.
- The 55-case matrix verifies mocked backend compatibility, not generated content quality or 55 rendered real-AI files.
- Legacy title-based source lookup remains an adapter for older records. Persisted dependencies use stable section IDs. Section-to-business-field dependencies are deliberately conservative: all current source fields are attached rather than claiming exact semantic attribution.
- Parent implemented operating metric/provenance payload support and V3 page/sourceId projection with page-local approval. The new local SQL harness passed those parent-authored scenarios; earlier browser screenshots are not substituted for later V3 browser evidence. Parent retains ownership of request-size bounds for image-bearing approval previews and full-suite integration.
- Text regeneration preserves native/manual chart data and marks it stale rather than inventing or silently replacing chart values. Full linked chart regeneration/acknowledgment is not claimed complete here.
- The per-plan history limit requires a future retention/archive policy before promising indefinite unbounded update history.
- No customer-facing sale/readiness conclusion follows from local-only success.
