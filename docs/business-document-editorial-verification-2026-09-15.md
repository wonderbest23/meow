# Business document editorial and executive summary verification

Date: 2026-09-15

## Implemented scope

- Generation prompts now describe the reader, purpose, business stage and 11 sector-specific content priorities. They request a conclusion, supplied evidence and next actions, distinguish proposals from actual records, and forbid invented calculations and evidence.
- Stored operating periods are included in generation context. Existing period comparison functions supply actual values and absolute changes. Missing expenses remain missing, and unequal period lengths are disclosed. Operating context changes during background generation reject the stale save.
- Both normal and streaming section generation run the same deterministic quality gate after the existing coach review. Empty bodies/headings/table cells, exact repeated paragraphs, unprovided URLs and unsupported KRW/percentage values fail generation. Existing saved documents survive a failed generation; the save-race test also checks no replacement or regeneration-charge write occurs.
- Percentage comparisons preserve decimals: 10.1% and 10.4% are different; equivalent 10.10 percent notation is accepted. Signed percentages and fractional plain KRW amounts are covered. Korean composite currency notation uses the existing amount parser.
- The document reader and download dialog offer a one-page summary alongside the detailed plan. A saved business can be summarized before detailed sections exist. Empty source records do not produce an exportable generic summary.
- The summary derives business/customer/offer/price/channel/action fields from saved coach or legacy context, financial scenarios from the existing financial engine, and actuals from operating records. Source/proposal/calculation/missing labels remain visible in the UI and files. Partial costs cannot produce a profit scenario.
- PDF and Word summary rendering is separate from the existing detailed plan rendering. The export endpoint accepts `view: summary | detailed`; summary data is rebuilt server-side from the owned plan rather than client-supplied prose. A supplied stale `sourceVersion` returns 409. Existing access checks remain in place.

## Files

- New model/quality modules: `lib/plan-builder/document-editorial.ts`, `document-quality.ts`, `executive-summary.ts`.
- Generation integration: `lib/plan-builder/section-generator.ts`, `section-service.ts`, `plan-type-guidance.ts`, `app/api/plan/generate/route.ts`.
- Reader/export integration: `app/plan/document/ExecutiveSummaryView.tsx`, `DocumentWorkspace.tsx`, `DocumentWorkspace.module.css`, `page.tsx`, `app/api/plan/document/route.ts`, `lib/delivery/document-renderer.ts`, `lightweight-pdf.ts`.
- Tests: `scripts/document-editorial.test.ts`, `executive-summary.test.ts`, `executive-summary-fixture.ts`, `executive-summary-browser.mts`, and the added failure-preservation case in `section-save-race.test.ts`.

## Verification

- `node --import tsx scripts/document-editorial.test.ts`: passed. AI HTTP responses are intercepted synthetic fixtures, including both normal and streaming generation failures.
- `node --import tsx scripts/section-save-race.test.ts`: passed. Mock AI/PostgREST; includes unsupported-number failure and saved-document preservation.
- `node --import tsx scripts/executive-summary.test.ts`: 11 sector labels x 5 purposes x 3 stages, 165 single-page PDF renders; source labels, period comparison, missing costs, stale action/version, corrupt records and DOCX structure checks.
- Isolated Next/Playwright browser: passed at 320, 390, 768 and 1440px. Summary selection, PDF/Word downloads using actual rendered bytes, detailed export request, reload, no-details summary availability, horizontal overflow and page errors are checked. Business state/access/export transport are mocked; this is not an authentication or payment verification.
- Startup, operating and long-input PDF/Word fixtures are in `artifacts/executive-summary/`. Word files were rendered with the bundled LibreOffice and visually inspected as one page with Korean glyphs. The headless renderer required Fontconfig to point to `public/fonts`; no operating-system application configuration was changed.
- Existing focused suites passed: `plan-section-service`, `document-context`, `document-completion`, `document-table-roundtrip`, `document-editor`, `document-edit`, `plan-context`, `financial-workbook`.
- Final `tsc --noEmit --incremental false` and scoped `git diff --check`: passed.

## Explicit limitations and remaining gates

- Deterministic numeric checking covers KRW and percentages only. It does not validate counts, durations, dates, all units, formula semantics, or whether an otherwise allowed number was attached to the correct subject. Missing conclusion/evidence/action wording is a warning, not a semantic quality guarantee.
- The summary is a source-based executive brief with disclosed bounded excerpts, not an AI rewrite of every manually edited detailed paragraph. Full original records are preserved. Numeric actual-vs-target comparisons require structured period targets; currently actual period changes and separately labeled goals/planned scenarios are shown without inventing target percentages.
- The 165 renders vary sector/purpose/stage around a fictional fixture. They verify branching and layout, not 165 real industry-specific AI outputs or all-sector editorial quality acceptance.
- No paid AI calls, real PG approval, production deployment, feature-flag changes, commits or pushes were performed. Real provider quality, remote Workflow/auth/entitlement/download recovery, Microsoft Word compatibility and user-task completion remain separate release gates.
- Other agents own document refresh/artifact coordination, proposal/deck editing and homepage work. Their concurrent changes were preserved and are not claimed by this implementation.
