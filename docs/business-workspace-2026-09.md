# Business Workspace: Expert Editing and Launch Preparation

## Implemented

- `app/plan/workspace`: optional expert editor alongside the existing simple summary.
- `PATCH /api/plan/expert`: owner-scoped edits, revision checks, active-job rejection, compare-and-swap persistence, and server-protected history (last 20 changes).
- Changes update shared coach fields and document revision. Existing document text and manual edits are not overwritten. Document regeneration remains an explicit request through the existing chat workflow and entitlement checks.
- Expert review compares changed values before saving. It can stage a reversal of a previous change for review. Financial comparisons are calculations, not observed results; missing costs are not zero.
- Launch preparation branches on idea-only / launch / improvement, workplace needs, and registration status.
- A single active step exposes an editable draft, optional note, prepare/skip actions, and previous records. Business revisions mark records for review without deleting them.
- Shared-office quotations compare user-entered figures, including deposits separately from fees. These are not market-price appraisals or legal determinations.
- Website creation uses the existing gated homepage route. Design/development inquiries prefill the existing support composer and require the user to send; they do not create a paid order automatically.
- Tax/registration/lease pages link to official guidance. External tax-professional search is labeled as external search, not a partnership or reservation.

## Not Implemented / Not Claimed

- Tax-professional assignment, appointment booking, filing, business-registration submission, lease execution, domain purchases, payment-provider approval, and marketing-agency fulfillment.
- Launch notes do not silently replace business-plan facts. The selected step can be carried into the existing AI chat for review.
- No new paid AI generation or production deployment was executed during this change.

## Verification

- `UNIT_ONLY=1 TSX_DISABLE_CACHE=1 node --import tsx scripts/business-launch.test.ts`: passed.
- New TypeScript/TSX files: transpilation diagnostics passed.
- Full UI test command: `node --import tsx scripts/business-launch.test.ts` (320, 390, 1440px, mocked API, no paid AI requests).
- Full UI verification and full-project typecheck are pending. Existing project files, including global styles and shared app chrome, were iCloud `dataless` placeholders. Download requests were made, but page navigation timed out while files remained unavailable.
- Existing dependency installation was restored with `npm ci --ignore-scripts --no-audit --no-fund`, preserving the lockfile dependency versions. Dev server was restarted on port 8083.

## Resume Checklist

1. Download the entire project source in Finder and keep it locally available; do not replace unavailable user files with invented placeholders.
2. Run `npx tsc --noEmit --incremental false` and fix any findings.
3. Run `scripts/business-launch.test.ts`, `scripts/business-hub.test.ts`, and `scripts/document-workspace.test.ts` with the local server running.
4. Inspect screenshots in `artifacts/business-launch` for mobile overflow, primary-action placement, and desktop readability.
5. Verify the real authenticated expert endpoint against a disposable test plan before deploying. No production readiness claim should be made until this is complete.
