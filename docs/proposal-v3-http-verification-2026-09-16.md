# PPT v3 HTTP and source-revision verification

Repository: `/Users/juhong/Developer/meow-main`

## Implemented

- `app/api/plan/proposal/route.ts` now reads at most 10,000,000 actual request bytes. This accommodates the existing 2MB-per-image and 8MB-total-edit schema without trusting Content-Length or counting Unicode characters as bytes.
- `lib/http/bounded-json.ts` rejects oversized declared bodies before reading, checks every streamed chunk, cancels on overflow/abort, bounds its accumulation buffer, rejects invalid UTF-8/JSON, and does not expose request contents or transport errors.
- The existing ownership/authentication/payment ordering and save/download rate policies are unchanged.
- Native renderer `proposal_layout_review_required` failures return HTTP 422 with a stable code and instructions to fix the layout. Saved edits are not removed.
- `proposal-revision.ts` now previews visible v3 pages, excludes deleted pages, and treats custom/copied pages conservatively. Approval materializes an independent base per visible page and updates `page.sourceId` to that page ID, retaining public IDs/order/layouts and making copy approvals independent.
- `keep_manual` on a copy retains its complete authored text/content; `use_revised` still preserves manual images, charts, positions and alignment. Existing v2 manual-field behavior is preserved.
- Approval receipts now populate the additive `retainedSlideIds` array. The parent legacy service must persist these IDs as stale, union them with previously retained IDs, and clear only pages explicitly refreshed without retention. This helper does not itself mark an entire document current.

## Tests passed

```sh
node --import tsx scripts/proposal-body-reader.test.ts
node --import tsx scripts/proposal-http-body.test.mts
node --import tsx scripts/proposal-revision.test.ts
node --import tsx scripts/proposal-rewrite.test.ts
./node_modules/.bin/tsc --noEmit --incremental false
```

The real HTTP fixture starts an isolated Next server, copies the actual route/body reader/editor/rate limiter/renderer, and stubs only identity/access inputs in that temporary copy. Persistence is real editor-service logic using demo-memory, not a remote database.

Observed checks:

- 962,622-byte valid image save and native PPTX download (previous 100KB limit exceeded).
- Chunked transfer without Content-Length, including a UTF-8 character split across writes.
- Exact 10,000,000-byte body accepted by the reader and subsequently rejected by schema, not by size.
- Oversized Content-Length rejected before body upload.
- Oversized chunked Unicode rejected by actual bytes even though the character count is below the limit.
- Invalid UTF-8/JSON, short/invalid Content-Length hints, stream failure, cancellation and pre/mid-read abort.
- HTTP 404/401/402 ownership/access outcomes unchanged.
- Existing save limit 60/minute and download limit 12/10 minutes enforced by the real rate limiter. Rate rejection occurs before body consumption.
- Genuine layout failure returns 422; saved revision and overflowing title remain recoverable.
- v2 source compatibility; v3 deleted/custom/copied targets; independently accepted/kept copies; source validation; image/chart/layout/alignment retention; receipt stale IDs; full undo and immutable input snapshots.

## Artifacts

- `/private/tmp/oneul-proposal-http-meaBDR/report.json`
- `/private/tmp/oneul-proposal-http-meaBDR/server.log`
- `/private/tmp/oneul-proposal-http-meaBDR/http-image.pptx`

## Limits and coordination

- Authentication inputs were stubbed, so this is not a real Google login or PG verification.
- Parent owns projected-page payload/result integration in `proposal-rewrite-service.ts`, new artifact service integration, and persistence/UI handling of retained stale IDs.
- No paid calls, production deployment, commits or feature flag changes. The isolated HTTP server was stopped.
