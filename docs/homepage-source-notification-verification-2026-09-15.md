# Homepage source updates and lead notifications

Date: 2026-09-15. Scope: local implementation and isolated verification only.
No production deployment, remote migration, paid generation, real email, or scheduled job was performed by this task.

## Source update contract

- `GET /api/plan/landing/source?projectId=...` requires an authenticated project owner and delegates to the shared artifact preview service. It does not write data.
- `lib/landing/source-update.ts` exports pure preview/apply helpers. Changes use field IDs, template node IDs, visibility IDs, canonical business source IDs, the source revision, project revision, and a draft fingerprint.
- `HomepageSourceUpdate` is reachable from the existing homepage owner panel. It previews current/proposed values and defaults manually edited or unknown fields to keep. Explicit selection is required to replace a manual conflict.
- Approval uses the artifact agent's existing `POST /api/plan/artifact-updates` with `type: homepage_apply`, UUID, preview hash/base, and a `replace` or `keep` choice for every change. There is no second write/synchronization endpoint.
- The same UUID and payload are retried after an uncertain response. Unsaved local edits disable import; changes during an in-flight request are retained instead of overwritten.
- Only draft content is changed. Existing public version and publication approval remain separate. Unselected source items remain pending, not silently current.
- Images, links, sizes, order, and nonselected nodes are preserved. Fact visibility changes appear explicitly in the preview.
- Provenance lives in optional `pageData.sourceSnapshot`. A snapshot from another plan cannot authorize automatic replacement. Initial generated drafts seed it; the parent drops it on template changes rather than pretending that template node IDs have been rebased.

## Lead notification contract

- Migration `0034_landing_lead_notifications.sql` adds a server-only outbox and an insert trigger. A newly stored lead and its outbox record commit together. Historical contacts are not backfilled or emailed.
- Public lead creation still succeeds when the inquiry was saved but notification dispatch is unavailable. A post-response attempt is best-effort; the durable record remains recoverable.
- Claiming uses a 90-second lease and token-guarded updates. An immutable recipient/body and attempt are stored before the provider request. Retrying uses `landing-lead/<lead-id>`; at most five provider attempts are allowed.
- Only existing `RESEND_API_KEY` and `NOTIFY_FROM_EMAIL` configuration is read. Missing configuration or an unverified/missing account email is blocked, never marked sent. No new secret or provider setup was introduced.
- The recipient is the owning project's verified account email. The message contains only a generic saved-inquiry notice and the owner page link, not the lead's name, email, phone, or message. Provider responses and recipient data are not logged or exposed in owner status responses.
- Internal `sent` means provider request accepted with an email ID. The owner UI says the email was accepted for sending; it does not claim inbox delivery.
- Owners can inspect status and explicitly retry through `/api/projects/[projectId]/landing/notifications`. The manual support-admin drain is `POST /api/admin/landing-notifications`, processing at most ten due items per request. No cron or scheduled Worker handler was installed. Configuration-blocked records need explicit retry after configuration is repaired.

## Provider verification

Official documentation checked on 2026-09-15: Resend supports `Idempotency-Key` on `POST /emails`, retains keys for 24 hours, and limits keys to 256 characters. Repeating the same payload/key returns the original result. A `409 concurrent_idempotent_requests` is retryable; a `409 invalid_idempotent_request` signals a different payload and is not automatically retried. [Resend idempotency documentation](https://resend.com/docs/dashboard/emails/idempotency-keys)

The implementation's **23-hour cutoff is our conservative safety margin**, not a Resend setting: an uncertain old attempt becomes `delivery_unknown` rather than risking a new send after provider deduplication expires. Request fields and HTTP endpoint also follow the [Resend Send Email API](https://resend.com/docs/api-reference/emails/send-email). These are documentation checks, not live-provider delivery evidence.

## Template readability

- `businessNeedsFlow` detects supported business templates with replaced photos or text exceeding the fixed artboard's safe capacity.
- Those pages use the existing semantic business renderer on desktop as well as mobile. Dark headings sit on a solid light background, separate from actual product media. Photos retain their natural aspect ratio instead of being forcibly cropped or darkened.
- Original safe template artboards remain in use. Node IDs, text, images, links, sizes, hidden sections, and section ordering remain in the same model.
- This is a readability fallback, not pixel-identical preservation of the original artboard after arbitrary edits. The owner should review the changed composition before publishing.

## Executed verification

| Check | Result | Evidence / limitation |
| --- | --- | --- |
| Source mapping unit tests | Passed | `node --import tsx scripts/landing-source-update.test.ts`: ten templates, exact selection, manual conflicts, foreign-plan snapshots, source/draft guards, partial provenance, explicit visibility |
| Existing landing mapping tests | Passed | `scripts/landing-business-content.test.ts` and `scripts/landing-from-plan.test.ts` |
| Notification processor tests | Passed | `node --import tsx scripts/landing-lead-notifications.test.ts`: configuration, rejection, concurrent 409, attempt bounds, lease contention, durable payload, crash recovery, uncertain cutoff; mocked provider transport only |
| Actual local Supabase transactions | Passed | `node --import tsx scripts/landing-lead-notifications-db.test.mts` against marker-validated `127.0.0.1:55432` after the parent applied local 0032+0034; no reset |
| SQL coverage | Passed | Lead/outbox trigger atomicity, rollback without orphan, exclusive claim, expired lease, due-time guard, explicit retry, sent deduplication, exhausted crash recovery, role privileges, cascade deletion; unique fixtures enclosed in `BEGIN`/`ROLLBACK` |
| Owner compare browser | Passed | 320/390/768/1440px, manual default keep, uncertain-response identical UUID/payload replay, draft-only response handling, unsaved-edit guard; preview/apply API mocked |
| Source request lifecycle | Passed | `scripts/local-homepage-source-browser.mts --source-only`: top-level 403/409 messages, project switching during preview/apply, clearing modal/choices/pending receipts/errors, delayed responses with ignored cancellation, leaving and returning to the same project while a newer request remains busy |
| Template browser matrix | Passed | Ten templates x two synthetic light/dark photos x 320/390/768/1440px = 80 cases; long Korean heading, loaded uncropped media, no title/media overlap or viewport overflow |
| TypeScript | Passed | `./node_modules/.bin/tsc --noEmit --incremental false` |

Latest browser evidence: `artifacts/homepage-source/1789483098964/report.json` and screenshots, rerun after fixing the close icon hidden by legacy global button CSS. The browser test copies the app into a temporary no-env workspace, disables paid features, blocks nonlocal browser requests, and shuts down its temporary server/browser on completion. It is not remote end-to-end evidence. Representative comparison and desktop/mobile layout screenshots were also inspected visually.

Follow-up source lifecycle evidence: `artifacts/homepage-source/1789483516665/report.json`. This focused rerun includes the four-width compare checks and lifecycle cases above; it does not rerun the unchanged template matrix.

## Remaining release gates

1. Real Resend sender/domain configuration, actual recipient mailbox arrival, bounce handling, and remote post-response runtime behavior remain unverified. Do not advertise reliable inbox delivery based only on these tests.
2. Due retries currently require the manual operator drain or owner retry. Automatic scheduled retry is not enabled; authorize and validate a scheduler separately before making unattended-retry promises.
3. The source UI used a mocked approval endpoint in its browser test. The artifact agent owns actual atomic API/DB approval and cross-artifact transaction verification. Combine that evidence with this task's tests; do not describe this browser test as a remote authenticated full flow.
4. Public publish/restore/cache, live authentication/payment, AI generation, and remote rollout are outside this task. No remote flags were enabled.
5. The template matrix checks deterministic extreme light/dark media and long text. It does not replace human review of every customer's real photos, all arbitrary node-level edits, or the overall site's aesthetic quality.
