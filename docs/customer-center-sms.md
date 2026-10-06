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
- Refund notifications, support-reply customer notifications and other usage events remain unimplemented. Payment-complete, lead-contact, visitor-receipt, domain and tax alerts were added later in relay v4 (see the last section).

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
node -r ./scripts/ledger-test-runtime.cjs --import tsx scripts/launch-notifications.test.ts
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

## Homepage-owner SMS (relay v3, 2026-10-01)

Homepage owners ("사장님") can register a mobile number in the homepage panel ("접수된 문의" → "문의 알림 문자 받을 휴대폰", explicit consent). New homepage inquiries and the Monday weekly report then go to that number by SMS. Email is used only as a fallback when no number is registered and email is configured.

- Request v3 carries only `recipient` (010 mobile) and an event type: `homepage-lead` (no params) or `weekly-report` (`leads`, `prevLeads`, `views` integers). The relay builds the text from fixed templates; free text, sender and message fields are rejected. Both templates fit one SMS (≤ 90 EUC-KR bytes) at the largest allowed numbers.
- The phone is stored in `landing_sites.alert_phone` (+ `alert_phone_agreed_at`, migration `0039_landing_alert_phone.sql`), never in the public homepage draft.
- Event IDs: the lead ID for inquiries, and a stable UUID per homepage+week for reports, so app-side retries return the relay's recorded result instead of sending again.
- Relay limits: `customerDailyLimit` (all owner SMS per UTC day) and `perRecipientDailyLimit` (per number per day), counted separately from the operator's own alerts (`dailyLimit`, max 10). Blocked/rejected results stop; only unconfirmed results are retried with the same event ID.
- Sender: `customerSender` must be a number pre-registered in Aligo. It is what owners see. Decide deliberately whether to use the operator's personal number.

### Upgrade the installed relay

1. Upload `ops/owner-sms/relay.py` and `ops/owner-sms/upgrade_customer.py` to the server (same directory).
2. `sudo python3 upgrade_customer.py` — asks for the sender number, daily limit (default 300) and per-number limit (default 20), and whether to enable now. It backs up the current relay and config (`*.before-v3-<time>`), validates the new config, restarts the service and rolls back on failure. The attempts database is migrated in place (existing rows become operator alerts).
3. On the Worker set `CUSTOMER_SMS_ENABLED=1` (the relay URL, secret and `OWNER_SMS_MODE` are shared with operator alerts).
4. Apply migration `0039_landing_alert_phone.sql` in Supabase.

To stop owner SMS: set `customerEnabled` to `false` in the relay config (or `CUSTOMER_SMS_ENABLED=0` on the Worker). Operator alerts are unaffected.

## Launch notifications (relay v4, 2026-10-06)

Relay v4 adds fixed templates that are filled only with values the relay validates itself. v1–v3 request bodies, receipts and the attempts database are unchanged, so the old Worker keeps working against the new relay, and the new Worker degrades when it still talks to an old relay (an old relay answers v4 with HTTP 400 `INVALID_REQUEST`; the app treats that as "unsupported" and falls back, never throwing into the payment or lead path).

| Event | To | Text (built in the relay) | Params the relay accepts | If unsupported / failed |
| --- | --- | --- | --- | --- |
| `payment-paid` | operator (`ownerPhone`, `recipientCheck` like v1) | `[오늘창업] 결제 {상품} {금액}원 {주문번호}` | `product` key (plan, homepage, bundle, regen, domain, domain-purchase, tokens), `amount` 1–10,000,000, `orderId` `PB-…` | operator email (`OWNER_NOTIFY_EMAIL`) |
| `payment-receipt` | buyer phone from checkout (optional) | `[오늘창업] 결제 완료 {상품} 주문 {주문번호}` | `product`, `orderId` | buyer still gets the email receipt |
| `homepage-lead-contact` | homepage owner `alert_phone` | `[오늘창업] 새 문의 {이름} {연락처} 확인 oneulstart.com/plan/homepage` | `name` (Korean/Latin only, max 10 chars, others stripped; empty → `이름 없음`), `phone` digits `0…` 9–11 or empty | v3 `homepage-lead` fixed text (same event ID) |
| `lead-received` | the visitor's 010 number | `[{가게이름 ≤12자}] 문의가 접수됐어요. 곧 연락드릴게요.` | `store` (Korean/Latin/digits/space, max 12 chars) | not sent |
| `domain-connect-started` | homepage owner `alert_phone` | `[오늘창업] 도메인 {www.주소} 연결을 시작했어요` | `domain` `.com/.kr/.co.kr`, optional `www.` | owner email only |
| `tax-deadline` | homepage owner `alert_phone` | `[오늘창업] 종합소득세 신고 마감 D-7 (5/31)` | `kind` income/vat, `days` 1 or 7, `month`, `day` | not sent; retried the same day after upgrade |

- Byte limits: every template is SMS (≤ 90 EUC-KR bytes) at its largest allowed values except `domain-connect-started` with a long domain, which goes as LMS (fixed title `오늘창업 알림`, ≤ 2000 bytes). The receipt check requires the same `msg_type` that was sent. Hangul outside KS X 1001 (e.g. 똠) is stripped from names because it would be sent as an 8-byte composition sequence.
- Privacy: the lead-contact SMS deliberately carries the inquirer's name and phone (operator decision, so the owner can call back). The inquiry text is never sent. The privacy policy (`lib/platform-legal/domain.ts`, history 2026-10-06) says so; decide whether the new effective date needs the 7-day notice before enabling.
- Limits: `payment-paid` counts toward `dailyLimit` (operator alerts; the maximum is now 200 instead of 10). Everything else counts toward `customerDailyLimit` and `perRecipientDailyLimit`. The visitor-receipt SMS goes to a number typed into a public form, so the per-number daily cap and the lead form's IP limit are the anti-abuse controls.
- Once per event: payment events use `payment_orders.paid_notified_at` (conditional update, migration `0040`) plus stable event IDs per order; the email receipt uses Resend `Idempotency-Key: payment-receipt/{orderId}`. Orders confirmed more than 24 hours ago are not notified. Tax reminders use `tax_reminder_sends` (hashed phone + deadline + days before; no raw number) and run from the 5-minute cron only on D-7/D-1 between 09:00 and 21:00 KST. Without migration `0040` tax reminders are skipped and payment alerts are sent only from the request that completed the order.
- Tax deadlines: 5/31, 1/25, 7/25, moved to Monday when they fall on a weekend. Public holidays are not computed — add the NTS-announced date to `TAX_DEADLINE_OVERRIDES` in `lib/operations/tax-calendar.ts` for such years (e.g. check 2028-01-25 against the Seollal holidays).
- Domain: marking a domain-purchase order "registered" in `/admin/domains` now also creates the Cloudflare custom hostname `www.{domain}` for that plan's published homepage, saves it on the site and notifies the owner. Any failure (homepage not published, another domain attached, Cloudflare not configured or erroring) leaves the order registered and shows a warning in the admin screen; the owner can still press "연결 시작".

### Upgrade the installed relay to v4

1. If the relay is still v1/v2 (no `customerSender` in config), do the v3 upgrade above first — it installs the same new `relay.py`.
2. Upload `ops/owner-sms/relay.py` and `ops/owner-sms/upgrade_v4.py` to the server (same directory), e.g. `scp relay.py upgrade_v4.py <server>:~/oneul-v4/`.
3. On the server: `cd ~/oneul-v4 && python3 -B test_relay.py` is optional (upload `test_relay.py` too); then `sudo python3 upgrade_v4.py`. It asks for the operator daily limit (1–200, default 100) and whether to turn on operator payment SMS (`paymentEnabled`, default no). It backs up `relay.py.before-v4-<time>` and `config.before-v4-<time>.json`, validates the new config with the new relay, replaces `/opt/oneulstart-owner-sms/relay.py`, runs `systemctl restart oneulstart-owner-sms`, checks it is active and rolls back on failure.
4. New relay config keys: `paymentEnabled` (bool, optional, default off). Changed: `dailyLimit` now accepts 1–200. Customer v4 events reuse `customerEnabled`, `customerSender`, `customerDailyLimit`, `perRecipientDailyLimit`.
5. Apply migration `0040_payment_notice_and_tax_reminders.sql` in Supabase.
6. Worker: set `OWNER_SMS_PAYMENT_ENABLED=1` for operator payment SMS (also needs `OWNER_SMS_ENABLED=1`, `OWNER_SMS_TRANSPORT=relay`, `OWNER_SMS_TO`, relay URL/secret/mode). Buyer, lead-contact, visitor, domain and tax SMS use the existing `CUSTOMER_SMS_ENABLED=1`. Email receipts need `RESEND_API_KEY` and a verified `NOTIFY_FROM_EMAIL` (not `onboarding@resend.dev`).

Rollback: `sudo cp /opt/oneulstart-owner-sms/relay.py.before-v4-<time> /opt/oneulstart-owner-sms/relay.py`, restore the config backup, `sudo systemctl restart oneulstart-owner-sms`. The app falls back automatically (operator email, v3 lead text, email receipts).
