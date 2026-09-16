# Artifact productization implementation

Started: 2026-09-15. Integration continued on 2026-09-16 (KST).

This records implementation and evidence for the approved all-industry plan. It is not a production launch approval. Existing user changes were preserved; no commit, remote migration, production deployment, feature activation, real payment or email was performed in this implementation run. Paid synthetic AI verification is recorded separately below.

## Implementation

| Area | Implemented behavior | Verification boundary |
| --- | --- | --- |
| Homepage editing | Element-scoped async merges, element/session version checks, explicit conflict choices, stale-response rejection after undo/template/close, tab-local recovery, saved/error states | Browser AI/upload responses are mocked; no real Storage deletion is claimed |
| Legacy homepage media fields | Latest callback/value guards, same-field conflict selection, stale template/project response cleanup | Isolated real React UI with mocked upload transport |
| Shared source changes | Independent artifact jobs, stable dependency IDs, document batches of 3 and PPT batches of 4, durable checkpoints, bounded retries, explicit approval and stale-source checks | Source mapping is conservative; unknown legacy dependencies require broader review |
| Transactional apply | Local migrations 0032/0035: atomic plan, PPT/document and homepage draft approval, bounded reservation/resume; public pointer unchanged | Actual local SQL and authenticated local HTTP/browser checks passed; no remote migration |
| V3 dependency integration | Projected page IDs/source IDs include copies/new pages and exclude deleted pages; page-local approval preserves independently retained copies | New operating/v3 regression plus full-suite integration |
| Period source integration | Stable metric IDs, units, period/revision and input provenance; operating-only changes invalidate dependent documents without relying on the coach revision | Missing expenses remain missing and actual period context reaches regeneration |
| Business document | Purpose/stage/industry prompts, operating context, quality checks, one-page summary, PDF/Word exports | Numeric deterministic checks cover KRW/percentages, not arbitrary semantic truth |
| PPT v3 | Copy-on-edit migration, page structure, content/table/chart/image edits, crop, alignment, undo/redo and common preview/export scene | Native chart XML/workbook verified; PowerPoint/Google Slides app compatibility remains separate |
| Homepage sources | Field/node-level current/proposed comparison, manual preservation, current draft/source versions, draft-only application | Remote authenticated lifecycle is not implied by local tests |
| Inquiries | Atomic notification outbox, owner status/retry, bounded support-admin drain, idempotency and uncertain-delivery cutoff | No automatic scheduler or real mailbox delivery verified |
| Responsive layouts | Safe semantic fallback for long content or replaced photos, preserved template/node data | A readability fallback, not a promise of arbitrary pixel-identical artboards |

## Verified evidence

- Reliability: 62/62 suites passed after the final heading, export formatting and cross-editor staleness fixes. A prior run caught a legacy manual-headline regression which was fixed. These suites disable external transport and provider credentials.
- `npx tsc --noEmit --incremental false` passed on the final runtime. Document regressions cover six heading-hierarchy cases and four repeated-section-heading cases. Provider schema tests recursively check strict required properties, including nested slide points.
- The separate TypeScript check for the four live/offline `.mts` entry points and `git diff --check` also passed after integration.
- `proposal-source-staleness.test.ts`: 11 additional regressions passed in isolated memory and actual local SQL. A retained chart stays stale after text/table regeneration; operating-only changes reach shared document status; partial approval leaves other sections stale; deleted page metadata is pruned and restored with its history. Legacy operating refresh routes to the unified update workflow instead of silently accepting an incomplete baseline.
- `scripts/local-landing-editor-async-browser.mts`: eight checks including active text editing during delayed AI, undo invalidation, crop cancel without upload, delayed upload during text edits, close cleanup, failed-save/reload recovery, legacy media field conflicts/template switch and 320/390/768/1440px toolbar bounds. See `artifacts/landing-editor-async/1789483785417/report.json`.
- PPT: 67 actual PPTX files rendered into 696 pages through LibreOffice/Poppler, including all 55 sector/purpose combinations. Native editable chart XML and embedded workbook values include numeric zero. Actual React editor at four widths covers page/content/chart/image edits, undo, save/reload/download. See `/private/tmp/oneul-proposal-v3-render-matrix/render-report.json` and `/private/tmp/oneul-proposal-v3-rUqCvL/report.json`.
- Image crop: 14,000 geometry invariants plus four-width real browser pixel/encoding checks, original-byte preservation, delayed encoding cancellation, zero uploads and object URL cleanup. See `landing-image-crop-verification-2026-09-15.md`.
- Artifact backend: 14 scenarios on local SQL, authenticated local HTTP/browser approval and reconnect, owner/plan CAS rollback, and seven reservation/resume checks. See `artifact-update-backend-verification-2026-09-15.md`.
- Document summary: 165 single-page PDF combinations. Three representative PDF/Word fixtures actually rendered and inspected, and the reader/download UI exercised at four widths. See `business-document-editorial-verification-2026-09-15.md`.
- Homepage: 80 template/image/viewport cases plus owner comparison UI. Actual local Supabase outbox SQL transactions, leases, rollback, role isolation and bounded retry checks passed. See `homepage-source-notification-verification-2026-09-15.md`.

The matrices use synthetic fixtures. They are not 55 or 165 paid AI generations, human quality scores, or evidence that every real customer input will render correctly.

## Actual AI result

One synthetic B2B prelaunch customer-proposal chain is complete: three core document sections and a 12-slide AI-generated deck, manual text/layout edits, a price update from KRW 1.5 million to KRW 1.8 million, reviewed document/PPT changes, explicit local approval, saved JSON restoration into a fresh isolated owner, and production PPTX/PDF/Word export. Independent manual edits were preserved. This is not a complete detailed business plan, a browser account-reconnect test, or remote persistence evidence.

Twelve new requests were recorded, including one HTTP 400 schema rejection. Two live defects were fixed: the Markdown quality gate rejected populated child sections under a parent heading, and the PPT rewrite provider schema incorrectly exposed an optional local point ID. The original first response was revalidated offline, and only the rejected PPT phase was retried after explicit diagnosis. All successful responses, failed requests, checkpoints and reservations remain archived; no completed paid phase was repeated.

The final local restore assertion initially compared JSON-restored data with pre-serialization `undefined` properties. The test now compares the exact JSON representation. Offline completion reused the already successful AI state without any further paid request.

Visual inspection also found repeated section headings and a short PDF table split across pages. Export now removes only an identical first heading, keeps short tables together when they fit, and keeps headings with following paragraphs. These changes do not rewrite the saved AI content. Final output: 12 PPT pages, 3 PDF pages and 3 Word pages, including the document cover. All files passed hash, Korean-text and nonblank-render checks. The 12-slide contact sheet and selected full-size slides, plus all document pages, were inspected; see `industry-ai-b2b-visual-review-2026-09-16.md` for exact review scope and remaining quality limits.

Evidence is under `artifacts/industry-ai-20260915/b2b_service`. Its result is deliberately marked `actual-ai-chain-complete-not-release-approved`. `scripts/industry-ai-render.mts` does not equate raster checks with visual or PowerPoint/Google Slides approval.

## Still required before launch approval

1. Complete the remaining 10-sector real-AI matrix, full detailed-plan and operating-stage cases, and actual browser account-reconnect/download checks. The next whole-sector reservation no longer fits the current balance; do not start paid work without a newly approved bounded plan or additional budget. Do not substitute mocked provider responses for this gate.
2. Run updated migrations and the Workflow in the approved remote test environment, then verify Google account linking, PG test approval, entitlements, response-loss recovery and reconnect downloads. Local synthetic paid-order records are not PG approvals.
3. Verify representative files in actual PowerPoint and Google Slides. PowerPoint is not installed in this Mac's `/Applications` inventory; native PPTX structure and LibreOffice rendering alone do not close this gate.
4. Exercise actual Storage upload/cleanup, source import, publish/republish/restore/cache behavior against the remote test environment. No custom-domain support claim is added.
5. Configure and verify real email sender/inbox delivery and an authorized scheduler for unattended outbox retries. Current draining is manual.
6. Review 11 industry baseline samples against the five quality criteria and conduct the five-person usability test. No human participants or scores are invented here.

## AI budget

The user explicitly approved an additional USD 20. The original ledger remains intact: cumulative approval USD 30, prior conservative reservations USD 7.1501, remaining reservation capacity USD 22.8499 and 9 prior calls at extension time. The extension receipt is recorded once under `oneul-all-industry-additional-20usd-2026-09-15`; repeated application does not add funds. Budget unit tests cover cumulative limits, duplicate extension, persistent reservations after timeout, lock, endpoint/model/tier restrictions and corrupt-ledger rejection. Reserved upper bounds are not the provider's actual bill. Paid runs must checkpoint each sector and stop before exceeding this same ledger.

After the completed B2B chain: 21 cumulative requests, USD 18.99255 reserved and USD 11.00745 remaining reservation capacity. Actual provider billing is not available. Failed-call reservations were not refunded. No further paid requests are running or scheduled; the next complete sector's conservative bound exceeds the remaining capacity.

## Safe preview

`node --import tsx scripts/productization-preview.mts` starts an isolated loopback-only source snapshot without copying env files or provider credentials. Current preview: `http://127.0.0.1:51845/dev/landing-editor`. This is a synthetic editor fixture, not an authenticated remote workspace or paid AI demo; fixture saves are not durable customer storage.

## Scope limits

- A summary is derived from stored business facts, calculations and operating records with disclosed bounded excerpts; it is not an AI rewrite of every manual detailed paragraph.
- Structural/numeric gates do not prove all numbers have the correct semantic subject, all dates/counts are grounded, or that an industry proposal has human-approved commercial quality.
- Retained charts and manually preserved content stay stale until explicitly reviewed; text regeneration is not evidence that their underlying data is current.
- PDF short-table and heading pagination is improved; arbitrary long tables, repeated table headers and oversized paragraphs still require broader pagination fixtures.
- Upload cleanup is best effort with signed owner-bound receipts and saved-reference checks; blocked/failed Storage cleanup still needs operational monitoring.
- Full free-form shape editing, re-uploaded PowerPoint synchronization, e-commerce/booking engines and official grant-template compliance remain excluded as agreed.
