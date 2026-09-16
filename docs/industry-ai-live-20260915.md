# Synthetic industry AI lifecycle runner

## Commands

Default preflight, no HTTP transport, no key read, no ledger or artifact writes:

```sh
node --import tsx scripts/industry-ai-live.mts
```

Reviewed live execution only:

```sh
node --import tsx scripts/industry-ai-live.mts --live --approved-total-usd=30
```

The runner only reads `OPENAI_API_KEY` from the local `.env.local` in live mode. It never imports the remaining environment values from that file. OpenAI Responses is the only allowed network endpoint; persistence is isolated demo memory. No DB, deployment, flags, or production files are changed.

## Scope and provenance

Each of the 11 authored synthetic inputs is a prelaunch customer proposal. The runner generates three real document sections through `generateSection`, edits one through the document editing service, and generates and reviews a real PPT through `buildDeckPlan`. It then updates the price using the real document refresh runtime, approves that draft in demo memory, and uses the production proposal rewrite service for batched PPT refresh and review. Initial document generation uses the legacy three-section path and its deterministic checks, not coach review or a complete nine-section business plan.

There are no pre-generated document or PPT outputs in the fixtures. Drafts, requests, responses, approvals, and checkpoints are saved under `artifacts/industry-ai-20260915/<sector>`. Saved JSON is restored into a fresh demo owner and exported with the production PPTX, PDF, and Word renderers. PDF/Word cover the three generated sections only. This is not a browser, remote persistence, or full detailed-plan test.

Manual changes are compared before draft approval. `keep_manual` conflicts must leave the proposal marked stale, including after restore; downloads remain available. No claim that retained old content is current is permitted. Without a conflict the runner verifies the preserved independent manual edits and the refreshed status.

## Budget and stopping

The original budget ledger is required and never reset. The cumulative cap is $30, including the original approvals and `INDUSTRY_APPROVAL_ID`. Preflight observed $7.1501 reserved and $22.8499 remaining. Reservations are conservative bounds, not actual billing.

The first B2B lifecycle has 9 calls for one update batch or up to 13 calls for three batches. Current bounds are $12.65605 and $19.09445 respectively, plus a $0.10 safety margin. All eleven one-batch reservation bounds total $139.233625; this is not a forecast of actual billing. The 64 cumulative-call ledger cap is also enforced. Do not expect all eleven full lifecycles to fit the approved balance.

A whole-sector worst-case preflight is required before starting it; the next sector starts only after the first completes and a fresh preflight fits. Each phase also checks budget. Generation, validation, review, network, or export failure stops the entire sequence. There is no automatic repair, fallback, repeated request, or failed-phase retry. Completed phases can resume from their saved state; failed/running checkpoints require explicit review rather than deletion or automatic reuse.

Preflight captures the real initial request construction, including bounded prior sections, then applies the same request validator as live mode. Future request body sizes are hard ceilings, not a simulated successful chain. Requests exceeding them stop before transport. No mocked provider response is counted as actual AI evidence.

## Reviewed checks and remaining gates

- Default dry-run: 33 generation requests captured and validated without transport; original ledger SHA-256 unchanged.
- Explicit TypeScript check includes the `.mts` entry point, which the normal repository tsconfig omits.
- Preflight includes a source hash of the runner, fixtures, budget guard, and all `lib` TypeScript sources. Re-run after runtime changes and review this hash before paid execution. Existing live manifests reject source changes on resume.
- One synthetic B2B chain completed actual generation, provider review, manual edits, price refresh, local approval, exact JSON restoration and native file export. Final files contain 12 PPT slides and three document sections across three PDF/Word pages including the cover. Twelve new requests include one rejected provider schema; actual billed cost is unknown. This is not real browser account reconnect or remote persistence.
- Final file hashes, Korean text and nonblank pages passed LibreOffice/Poppler rendering. The contact sheet and selected full-size PPT pages plus all PDF/Word pages were visually reviewed; see `industry-ai-b2b-visual-review-2026-09-16.md`. PowerPoint/Google Slides remain unverified.
- All five presentation purposes, full detailed plans, operating-stage records, remote auth/payment/Workflow, and release approval remain separate gates.

## Live findings and reviewed recovery

The real B2B run exposed two issues not represented by the original mocked provider fixtures:

1. A Markdown parent heading with populated child sections was incorrectly rejected as empty. The production quality gate was corrected with hierarchy-aware parsing; the exact original provider response was revalidated offline without a repeated paid call.
2. OpenAI rejected the PPT refresh JSON schema with HTTP 400 `invalid_json_schema` because the editable point `id` was optional. The provider-only schema now excludes local point identity, while normalization/approval preserve existing element IDs. Nested strict-object schema regression checks cover production generation and review requests.

The reviewed commands are exact-checkpoint recovery operations, not general retry switches:

```sh
node --import tsx scripts/industry-ai-live.mts --recover-reviewed-schema=ppt-points-required-20260915
```

This command was applied once. It archives the original failure and budget, leaves all completed documents and PPT data unchanged, and reopens only the rejected PPT-update phase. It does not refund reservations or send a network request. Running it against a different or already recovered state fails. The original failed request and all successful requests remain in the same cumulative ledger.

For a completed sector, verify actual output bytes and render every page:

```sh
SOFFICE_BIN=/Users/juhong/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override/soffice FONTCONFIG_FILE=/private/tmp/oneul-proposal-v2/fonts.conf node --import tsx scripts/industry-ai-render.mts artifacts/industry-ai-20260915/b2b_service
```

Raster/text checks do not substitute for visual review or Office-app compatibility testing.

## Exact reviewed runtime rebase (historical checkpoint)

The first paid B2B response was completed by OpenAI but rejected by the old nested-heading check. The explicitly reviewed offline recovery revalidated that same response through production generation without another paid call. Its immutable evidence is under `recoveries/b2b-generate-0-empty-heading-20260915`. At that historical checkpoint the ledger was $8.30515 reserved and $21.69485 available, with only `generate-0` complete. The recovery and runtime rebase below have since been applied; do not rerun them against the completed chain.

After the chart, operating-only, and retained-slide stale-status fixes are frozen and the parent explicitly gives the go-ahead, the following narrowly scoped command can update runtime hash metadata. It is not a general retry or quarantine override.

Read-only guard check, safe before the go-ahead:

```sh
node --import tsx scripts/industry-ai-live.mts --check-reviewed-runtime=b2b-stale-status-20260915
```

Apply only after the parent approves the frozen runtime:

```sh
node --import tsx scripts/industry-ai-live.mts --rebase-reviewed-runtime=b2b-stale-status-20260915
```

The command pins the exact recovered manifest, checkpoint, recovery receipt, original real-provider response/request, input, generated section, and unchanged ledger by hash. It requires only the completed `generate-0` phase and exactly the original provider request files across all sectors. Phase-zero generator, quality validator, and provider-completion runtime hashes must remain unchanged. The command does not load the API key, import the generation runtime, replay a response, or call any network transport.

Applying creates exclusive, read-only evidence copies and a receipt under `runtime-rebases/b2b-stale-status-20260915`. Only `manifest.sourceHash` and `checkpoint.fixtureHash` are replaced; all plan content, phase status, saved response, and budget entries remain unchanged. The same ledger lock excludes concurrent live calls. The exact reviewed command cannot be applied twice or used after further provider requests.

After a successful approved rebase, normal live resume remains separately explicit:

```sh
node --import tsx scripts/industry-ai-live.mts --live --approved-total-usd=30
```

Resume skips the recovered first section. Its remaining B2B reservation bound is $17.9394 for up to 12 calls, plus the $0.10 safety margin; the runner rechecks the live ledger rather than relying on this note.

## Completed state and current stop

`b2b_service/checkpoint.json` is complete and `result.json` is `actual-ai-chain-complete-not-release-approved`. Two PPT refresh batches completed with actual provider reviews. The initial JSON-restore comparison mismatch was a test issue involving omitted `undefined` properties, not lost saved content. `industry-ai-finish-local.mts` verified the exact serialized state and completed export offline without repeating successful requests.

`industry-ai-document-reexport.mts` subsequently regenerated PDF/Word from that same checkpoint after duplicate-heading and PDF pagination fixes. Previous files and hashes are archived; no AI content or budget entries were overwritten. The render report verifies the current hashes.

Current cumulative ledger: **$30 approved, $18.99255 reserved, $11.00745 available, 21 requests**. This task added 12 requests; one was HTTP 400 and its reservation remains. These are conservative reservations, not actual billed spend. No further paid calls are running or scheduled. The next sector's whole-chain bound does not fit, and runtime hashes changed after export fixes; further live execution requires a fresh reviewed preflight, not bypassing the manifest guards.

The remaining ten sectors, all-purpose live matrix, full detailed plans, operating-stage evidence, remote lifecycle and human usability criteria are not completed by the B2B result.
