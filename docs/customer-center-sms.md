# Customer-center owner SMS

Status (2026-09-27): The separately authenticated fixed-egress relay and matching Worker are deployed with owner-only inquiry and saved-business-plan alerts enabled. The narrowly scoped Cloudflare BIC exception is active, and the owner confirmed receipt after the single approved live SMS test. The later production activation used no additional paid SMS test, so end-to-end delivery of a new production inquiry or report event to the handset remains untested. No customer recipients, payment activation, or auto-top-ups are enabled. See the private production handoff dated 2026-09-27 for verification evidence and limits.

## Behavior

- A newly saved `/api/account/support` inquiry attempts one SMS to the server-configured owner. A replay of the same owned request ID does not send again.
- The message is fixed: `[오늘창업] 새 고객센터 문의가 접수됐습니다.` Inquiry text, customer identity, and contact details are not sent to the SMS provider.
- SMS only, one recipient, no LMS conversion, replacement delivery, automatic retry, or historical backfill.
- Existing email notifications remain. SMS and email run concurrently after saving; notification rejection does not turn a saved inquiry into an error. The SMS deadline is six seconds including quota lookup and receipt reading.
- A provider acceptance receipt is not proof of handset delivery. Unknown responses, timeouts, and network failures are not automatically retried.
- Aligo receives form-encoded `key`, `user_id`, one fixed `sender`/`receiver`, the fixed message, and explicit `msg_type=SMS`. Keys never appear in URLs. HTTP 200 alone is not success: require result code 1, one successful request, zero failed requests, SMS type and a positive message ID. Negative Aligo result codes are rejected, not retried.
- `OWNER_SMS_MODE=test` adds `testmode_yn=Y`. Test acceptance is returned as `test_accepted`, never real SMS acceptance. No implicit live mode is allowed.
- This is not a durable notification outbox. A process ending after the inquiry is saved but before notification can miss the alert. Replaying that inquiry does not resend. The inquiry remains in the existing customer-center inbox.

## Owner-only Business-plan Completion

- This phase keeps the owner as the only recipient, not merely the sender. Customer phone numbers, project titles, business content, identities and private report links are never added to the SMS payload.
- An `intake-design` job attempts the fixed `[오늘창업] 새 사업안 생성과 저장이 완료됐습니다.` alert only after schema validation, current-revision checks and successful result persistence. This is the saved business proposal, not a claim that a PDF/PPT export has completed or that its business assumptions are verified.
- `OWNER_SMS_REPORT_READY_ENABLED=1` on the Worker and `reportReadyEnabled: true` in the dedicated relay's private config are both required, in addition to the existing enable/mode/recipient settings. Both default to off. Deployment alone must not activate the new event. No private config or operational toggle was changed in this follow-up.
- The stable server-generated job UUID is the event ID. Replayed or concurrently claimed completed jobs do not notify again. The relay's existing SQLite event reservation also covers report alerts across restarts. Old inquiry v1 bodies remain byte-for-byte unchanged; a new v2 request carries the fixed `service: oneulstart` and `eventType: business-plan-ready`. Other service/event values and arbitrary recipient/message fields are rejected.
- Report alerts require the relay transport; they cannot fall back to the legacy direct adapter. Inquiry and report attempts share the existing `support-owner-sms`/`oneulstart` counter and the relay's maximum ten daily attempts. There is no new independent quota, automatic retry or refund of uncertain attempts.
- Notification failures do not mark a saved business plan as failed. Invalid AI output, failed saves and stale results do not send completion alerts. The existing post-save crash window remains: this is at-most-once attempt handling, not guaranteed eventual delivery.
- Physical Lightsail resources and Aligo prepaid balance remain shared as previously approved. The Oneulstart service identity, exact signed endpoint, private settings, fixed recipient and attempt database are separate. No Art&Bridge application, credentials, recipient list or counter is modified.
- Payment/refund notifications, customer email/SMS, support-reply customer notifications and other usage events remain unimplemented in this owner-only phase. Payment and beta API policies are unchanged.

## Private Server Configuration

Set these only in the Oneulstart server's private environment or Worker secrets, never `NEXT_PUBLIC_*`, browser code, chat, committed files, or handoff artifacts:

| Variable | Purpose |
| --- | --- |
| `OWNER_SMS_ENABLED` | Exact value `1` enables sending; otherwise disabled. Keep disabled until setup is verified. |
| `OWNER_SMS_REPORT_READY_ENABLED` | Exact value `1` opts into owner-only saved business-plan alerts; absent/other values remain disabled. Relay-side opt-in is also required. |
| `ALIGO_API_KEY` | Existing API key from the owner's approved Aligo account. Do not delete or reissue the other platform's key. |
| `ALIGO_USER_ID` | Matching Aligo user ID. |
| `OWNER_SMS_MODE` | Required `test` or `live`; no default. Test mode does not actually send or bill according to Aligo's API specification. |
| `OWNER_SMS_FROM` | A separately verified, preregistered Korean sender number, digits only. The requested recipient is not automatically an approved sender. |
| `OWNER_SMS_TO` | The owner's requested Korean mobile recipient, digits only. Do not put the real number in this document. |
| `OWNER_SMS_DAILY_LIMIT` | Explicit approved attempt limit, integer 1 through 1000. No default. |

The existing server-only Supabase connection and `0018_rate_limits.sql` must be available. The SMS path calls `bump_rate_limit` directly with bucket `support-owner-sms`, key `oneulstart`, and a fixed UTC-day window. It does not use the general limiter's memory fallback. Missing DB, RPC errors, invalid counts, or quota exhaustion block SMS only. Failed, uncertain and test-mode attempts retain their count. This is an attempt ceiling, not an exact currency ledger or a rolling 24-hour cap. The Aligo account's prepaid balance is shared with its other platforms: a different sender does not create a separate account balance or restrict the API key to that sender. Today's app pins its sender and recipient only in its own server config. Agree on a sending allowance before activation. The AI beta budget is not reused or increased.

## Existing Aligo Account and Network Boundary

Read-only inspection of the owner-opened Aligo API authentication screen confirmed an existing API key, two registered sending-server IPs and two sender numbers, including the requested personal sender. The owner-authorized Lightsail instance's fixed IP matches one existing Aligo registration. Existing key, sender and IP registrations remain unchanged. Private values and the account screen are not copied into this document or the shared result package.

The current Oneulstart app runs on Cloudflare Workers. Its general fetch is not a registered Aligo fixed source IP. Do not register the Mac IP, broad Cloudflare ranges, or remove Aligo authentication. The separate relay uses the existing approved server's IP without changing the other platform's SMS settings or data.

## Oneulstart Relay

`ops/owner-sms/relay.py` uses only Python's standard library. Its own service identity, private configuration and SQLite attempt ledger are separate from the existing platform. It listens only on loopback; an exact HTTPS location forwards the approved path. No host-wide SSH opening or new paid AWS resource is required.

- Set `OWNER_SMS_TRANSPORT=relay`, `OWNER_SMS_RELAY_URL` to the approved exact HTTPS path, and `OWNER_SMS_RELAY_SECRET` privately on the Oneulstart Worker. `OWNER_SMS_TO`, explicit mode and daily limit are still required. Aligo credentials remain on the relay, not the Worker. An invalid relay configuration never falls back to direct Aligo.
- The inquiry's server-generated message UUID is the event ID. HMAC-SHA256 binds timestamp, POST, fixed path and exact body. The relay checks a 60-second window and an HMAC recipient match without transmitting the raw phone in the request.
- The request has no sender, recipient, message or arbitrary forwarding URL fields. The relay uses its one private owner phone for both sender and receiver and one of the fixed Oneulstart event templates only.
- The relay atomically records an uncertain attempt before external transmission. Concurrent duplicates and process restarts cannot resend the event; failures/unknown outcomes count toward the same daily maximum of 10. No refund or automatic retry exists.
- `check_once.py` has separate persistent one-time test/live identifiers. Live checking requires successful non-billing test acceptance first. It disables sending after the check; a previous attempt cannot be silently rerun.
- The initial signed HTTPS test was blocked before the relay by Cloudflare HTTP403/error1010. After approval, a configuration rule disabled only Browser Integrity Check for `api.artandbridge.com` + `POST` + `/_oneulstart/support-owner-sms`. Other paths and checks remain unchanged. The later signed HTTPS test reached Aligo; the original failure is retained separately.
- Actual Aligo receipts returned decimal strings for `result_code` and `msg_id`. The relay accepts strict integer values or ASCII decimal strings only, while retaining positive-ID, one-success, zero-error and SMS-type checks. The before-fix test failed; the final nine relay tests passed. The unused legacy direct adapter is a separate implementation and was not activated on Workers.
- Three non-billing provider test calls and exactly one live provider call were made. The persistent live-check record blocks replay after restart or with another test revision. Do not repeat the paid test or delete its gate, including when activating the production Worker later.
- Temporary Lightsail browser-SSH IPv4 access was removed after verification. The original IPv6 SSH source and four other firewall rules were preserved. The browser SSH session was closed.
- The private config and recovery files are excluded from source, logs and handoff. Existing nginx config is hash-checked and backed up before a one-location insertion. Restore only that change; preserve the attempt database and account credentials.

## Activation Checklist

1. Preserve the existing Aligo account, other platform settings and all registered senders/IPs. Agree on the Oneulstart sending allowance; do not purchase credit or enable automatic top-ups implicitly.
2. Confirm an authorized production sending-server IP route and the requested registered sender. Store the existing credentials and fixed recipient privately only after the specific setup is approved. Never print them in commands or logs.
3. Verify the existing protected administrator inbox remains reachable by the owner. The current beta boundary still restricts `/api/admin/support/*`; this SMS task does not expand that policy.
4. Validate the shared counter on the intended persistent test/deployment environment. Mocked quota tests do not prove the deployed RPC permissions or provider delivery.
5. Reuse the completed non-billing and single live relay checks; the owner has confirmed handset receipt. The paid-test allowance is consumed. Finish the separately recorded Worker build/deployment and protected-inbox checks. Do not send a second paid test or report the relay check as a browser inquiry-to-production verification. For report events, deploy the matching relay/client versions while disabled before enabling both dedicated opt-ins; preserve all old receipt rows and the live-test gate.
6. Disable by setting `OWNER_SMS_ENABLED=0`. Inquiry storage and existing email remain. Do not delete messages, counters, or audit records to reset limits.

## Verification

```sh
node -r ./scripts/ledger-test-runtime.cjs --import tsx scripts/owner-sms.test.ts
node -r ./scripts/ledger-test-runtime.cjs --import tsx scripts/owner-sms-relay.test.ts
node -r ./scripts/ledger-test-runtime.cjs --import tsx scripts/owner-report-sms.test.ts
node -r ./scripts/ledger-test-runtime.cjs --import tsx scripts/owner-report-job.test.ts
python3 -B ops/owner-sms/test_relay.py
node --import tsx scripts/customer-center.test.ts
node --import tsx scripts/customer-center-storage.test.ts
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

The commands above use synthetic credentials/numbers and intercepted provider requests. They must not load `.env` files or send real messages. Remote Aligo tests and the one accepted live check are recorded separately, not included in these local regression results. The daily cap is ten attempts including uncertain and test-mode attempts; no counter was reset.

## Official References

Checked 2026-09-27:

- [Aligo SMS API](https://smartsms.aligo.in/smsapi.html) and [API specification](https://smartsms.aligo.in/admin/api/spec.html): registered sender required, URL-encoded send request, SMS type, result code/count/message ID, and non-billing test mode. The complete spec was read in the user's logged-in browser; web extraction returned 403 for the admin spec and was not treated as account/API connectivity failure.
- [Aligo API authentication settings](https://smartsms.aligo.in/admin/api/auth.html): the owner's existing key, approved sender and sending-server IP registrations were inspected read-only. No private values reproduced.
- [Cloudflare dedicated egress and Workers](https://developers.cloudflare.com/smart-shield/configuration/dedicated-egress-ips/other-products/): special egress options exist, but no such configuration or entitlement was verified for this project. Do not assume its regular Worker fetch has one registered static IP.
- [Supabase RPC](https://supabase.com/docs/reference/javascript/rpc) and [abort signal](https://supabase.com/docs/reference/javascript/using-modifiers-abortsignal): shared atomic counter with bounded request lifetime.
