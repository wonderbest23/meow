import concurrent.futures
import hashlib
import hmac
import json
import multiprocessing
import os
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch
from relay import PATH, Relay, aligo_send, customer_message, load_config, message_fits, signature, sms_bytes, v4_message

NOW = 1800000000
CONFIG = {"secret": "syntheticSecret" + "x" * 40, "ownerPhone": "01000000001",
          "aligoKey": "syntheticKeyOnly", "aligoUser": "synthetic-account",
          "mode": "live", "dailyLimit": 10, "enabled": True}


def request(event_id=None, **extra):
    data = {"version": 1, "eventId": event_id or str(uuid.uuid4()), "mode": "live",
            "recipientCheck": hmac.new(CONFIG["secret"].encode(), ("recipient:" + CONFIG["ownerPhone"]).encode(), hashlib.sha256).hexdigest(), **extra}
    body = json.dumps(data, separators=(",", ":")).encode()
    stamp = str(NOW)
    return {"x-oneul-time": stamp, "x-oneul-signature": signature(CONFIG["secret"], stamp, body)}, body


def process_attempt(args):
    db_path, event_id = args
    return Relay(CONFIG, db_path, sender=lambda _, _event: {"status": "accepted", "code": "PROVIDER_ACCEPTED"}, clock=lambda: NOW).handle(PATH, *request(event_id))


class RelayTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="oneul-sms-test-")
        self.db = Path(self.temp.name) / "attempts.sqlite"
        self.calls = 0
        def sender(config, event_type):
            self.calls += 1
            self.assertEqual(config["ownerPhone"], CONFIG["ownerPhone"])
            self.assertIn(event_type, {"support-inquiry", "business-plan-ready"})
            return {"status": "accepted", "code": "PROVIDER_ACCEPTED", "receiptId": "100"}
        self.sender = sender
        self.relay = Relay(CONFIG, self.db, sender, lambda: NOW)

    def tearDown(self):
        self.temp.cleanup()

    def test_signature_expiry_tampering_and_wrong_path_never_send(self):
        headers, body = request()
        self.assertEqual(self.relay.handle(PATH, {}, body)[0], 401)
        self.assertEqual(self.relay.handle(PATH, headers, body + b" ")[0], 401)
        old = str(NOW - 61)
        self.assertEqual(self.relay.handle(PATH, {"x-oneul-time": old, "x-oneul-signature": signature(CONFIG["secret"], old, body)}, body)[0], 401)
        self.assertEqual(self.relay.handle("/other", headers, body)[0], 404)
        self.assertEqual(self.calls, 0)

    def test_recipient_message_and_platform_cannot_be_changed(self):
        for extra in [{"receiver": "01000000002"}, {"sender": "01000000002"}, {"msg": "other"}, {"platform": "other"}, {"recipientCheck": "0" * 64}, {"mode": "test"}]:
            self.assertIn(self.relay.handle(PATH, *request(**extra))[0], [400, 409])
        self.assertEqual(self.calls, 0)

    def test_concurrent_duplicate_restart_preserves_single_send(self):
        headers, body = request()
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(lambda _: self.relay.handle(PATH, headers, body), range(16)))
        self.assertEqual(self.calls, 1)
        restarted = Relay(CONFIG, self.db, self.sender, lambda: NOW)
        self.assertTrue(restarted.handle(PATH, headers, body)[1]["duplicate"])
        self.assertEqual(self.calls, 1)
        self.assertEqual(len([r for _, r in results if not r["duplicate"]]), 1)

    def test_two_processes_share_exact_daily_cap(self):
        with multiprocessing.get_context("spawn").Pool(2) as pool:
            results = pool.map(process_attempt, [(str(self.db), str(uuid.uuid4())) for _ in range(16)])
        self.assertEqual(sum(status == 200 for status, _ in results), 10)
        self.assertEqual(sum(status == 429 for status, _ in results), 6)
        self.assertEqual(self.relay.handle(PATH, *request())[0], 429)

    def test_uncertain_crash_is_not_refunded_or_retried(self):
        def interrupted(_, _event):
            raise SystemExit("synthetic crash before receipt persistence")
        interrupted_relay = Relay(CONFIG, self.db, interrupted, lambda: NOW)
        headers, body = request()
        with self.assertRaises(SystemExit):
            interrupted_relay.handle(PATH, headers, body)
        result = self.relay.handle(PATH, headers, body)[1]
        self.assertEqual(result["status"], "uncertain")
        self.assertTrue(result["duplicate"])
        self.assertEqual(self.calls, 0)
        with self.relay.connect() as db:
            self.assertEqual(db.execute("SELECT count(*) FROM attempts").fetchone()[0], 1)

    def test_disabled_and_database_failure_fail_closed(self):
        stopped = Relay({**CONFIG, "enabled": False}, self.db, self.sender, lambda: NOW)
        self.assertEqual(stopped.handle(PATH, *request())[1]["code"], "SMS_DISABLED")
        self.relay.db_path = str(Path(self.temp.name) / "missing" / "db")
        self.assertEqual(self.relay.handle(PATH, *request())[1]["code"], "DURABLE_LIMIT_UNAVAILABLE")
        self.assertEqual(self.calls, 0)

    def test_config_requires_private_single_phone_and_cap(self):
        path = Path(self.temp.name) / "config.json"
        path.write_text(json.dumps(CONFIG)); path.chmod(0o600)
        self.assertEqual(load_config(path)["dailyLimit"], 10)
        path.chmod(0o644)
        with self.assertRaises(ValueError): load_config(path)
        path.chmod(0o600)
        self.assertEqual(load_config(path)["dailyLimit"], 10)
        path.write_text(json.dumps({**CONFIG, "dailyLimit": 200}))
        self.assertEqual(load_config(path)["dailyLimit"], 200, "v4: 결제 알림 때문에 200 까지")
        for extra in [{"dailyLimit": 201}, {"dailyLimit": 0}, {"ownerPhone": "01000000001,01000000002"}, {"mode": "auto"}, {"reportReadyEnabled": "true"}, {"paymentEnabled": 1}]:
            path.write_text(json.dumps({**CONFIG, **extra}))
            with self.assertRaises(ValueError): load_config(path)

    def test_provider_contract_exact_fixed_fields_no_network(self):
        sent = []
        class Response:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read1(self, _):
                if getattr(self, "done", False): return b""
                self.done = True
                return json.dumps({"result_code": 1, "msg_id": 123, "success_cnt": 1, "error_cnt": 0, "msg_type": "SMS"}).encode()
        class Opener:
            def open(self, req, timeout):
                sent.append(req)
                self_timeout = timeout
                assert self_timeout == 4
                return Response()
        with patch("relay.urllib.request.build_opener", return_value=Opener()):
            self.assertEqual(aligo_send(CONFIG)["status"], "accepted")
            self.assertEqual(aligo_send({**CONFIG, "mode": "test"})["status"], "test_accepted")
        import urllib.parse
        body = urllib.parse.parse_qs(sent[0].data.decode())
        self.assertEqual(sent[0].full_url, "https://apis.aligo.in/send/")
        self.assertEqual(body["sender"], body["receiver"])
        self.assertEqual(body["receiver"], [CONFIG["ownerPhone"]])
        self.assertEqual(body["msg_type"], ["SMS"])
        self.assertEqual(body["testmode_yn"], ["N"])
        self.assertEqual(urllib.parse.parse_qs(sent[1].data.decode())["testmode_yn"], ["Y"])
        self.assertEqual(set(body), {"key", "user_id", "sender", "receiver", "msg", "msg_type", "testmode_yn"})

    def test_provider_decimal_string_receipt_and_invalid_types(self):
        fixture = {"result_code": "1", "msg_id": "123", "success_cnt": 1, "error_cnt": 0, "msg_type": "SMS"}
        class Response:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read1(self, _):
                if getattr(self, "done", False): return b""
                self.done = True
                return json.dumps(fixture).encode()
        class Opener:
            def open(self, req, timeout): return Response()
        with patch("relay.urllib.request.build_opener", return_value=Opener()):
            self.assertEqual(aligo_send(CONFIG)["status"], "accepted")
            for value in [True, None, 1.1, "1.0", " 1", "+1", "1e0", "1" * 100]:
                fixture["result_code"] = value
                self.assertEqual(aligo_send(CONFIG)["status"], "uncertain")
            fixture["result_code"] = "-101"
            self.assertEqual(aligo_send(CONFIG)["code"], "ALIGO_REJECTED_-101")
            fixture["result_code"] = "1"
            for field, value in [("success_cnt", 2), ("error_cnt", 1), ("msg_id", "0"), ("msg_type", "LMS")]:
                original = fixture[field]
                fixture[field] = value
                self.assertEqual(aligo_send(CONFIG)["status"], "uncertain")
                fixture[field] = original

    def test_report_event_requires_explicit_opt_in_and_fixed_service(self):
        report = {"version": 2, "service": "oneulstart", "eventType": "business-plan-ready"}
        self.assertEqual(self.relay.handle(PATH, *request(**report))[1]["code"], "REPORT_SMS_DISABLED")
        enabled = Relay({**CONFIG, "reportReadyEnabled": True}, self.db, self.sender, lambda: NOW)
        for extra in [{"service": "other-project"}, {"eventType": "payment-complete"}, {"receiver": "01000000002"}, {"msg": "arbitrary"}]:
            self.assertEqual(enabled.handle(PATH, *request(**{**report, **extra}))[0], 400)
        self.assertEqual(self.calls, 0)
        headers, body = request(**report)
        response = enabled.handle(PATH, headers, body)
        self.assertEqual(response[0], 200)
        self.assertEqual(response[1]["eventType"], "business-plan-ready")
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            duplicates = list(pool.map(lambda _: enabled.handle(PATH, headers, body), range(8)))
        self.assertTrue(all(status == 200 and result["duplicate"] for status, result in duplicates))
        restarted = Relay({**CONFIG, "reportReadyEnabled": True}, self.db, self.sender, lambda: NOW)
        self.assertTrue(restarted.handle(PATH, headers, body)[1]["duplicate"])
        self.assertEqual(self.calls, 1)

    def test_inquiry_and_report_share_limit_and_conflicting_id_cannot_resend(self):
        enabled = Relay({**CONFIG, "dailyLimit": 2, "reportReadyEnabled": True}, self.db, self.sender, lambda: NOW)
        event_id = str(uuid.uuid4())
        self.assertEqual(enabled.handle(PATH, *request(event_id))[0], 200)
        report = {"version": 2, "service": "oneulstart", "eventType": "business-plan-ready"}
        self.assertEqual(enabled.handle(PATH, *request(event_id, **report))[1]["code"], "EVENT_CONFLICT")
        self.assertEqual(enabled.handle(PATH, *request(**report))[0], 200)
        self.assertEqual(enabled.handle(PATH, *request())[0], 429)
        self.assertEqual(self.calls, 2)

    def test_report_provider_uses_only_fixed_owner_and_short_template(self):
        sent = []
        class Response:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read1(self, _):
                if getattr(self, "done", False): return b""
                self.done = True
                return json.dumps({"result_code": "1", "msg_id": "123", "success_cnt": 1, "error_cnt": 0, "msg_type": "SMS"}).encode()
        class Opener:
            def open(self, req, timeout):
                sent.append(req)
                return Response()
        relay = Relay({**CONFIG, "reportReadyEnabled": True}, self.db, clock=lambda: NOW)
        with patch("relay.urllib.request.build_opener", return_value=Opener()):
            self.assertEqual(relay.handle(PATH, *request(version=2, service="oneulstart", eventType="business-plan-ready"))[0], 200)
        import urllib.parse
        body = urllib.parse.parse_qs(sent[0].data.decode())
        self.assertEqual(body["sender"], [CONFIG["ownerPhone"]])
        self.assertEqual(body["receiver"], [CONFIG["ownerPhone"]])
        self.assertEqual(body["msg"], ["[오늘창업] 새 사업안 생성과 저장이 완료됐습니다."])
        self.assertLessEqual(len(body["msg"][0].encode("euc-kr")), 90)
        self.assertEqual(body["msg_type"], ["SMS"])


CUSTOMER = {**CONFIG, "customerEnabled": True, "customerSender": "0212345678", "customerDailyLimit": 5, "perRecipientDailyLimit": 2}


def customer_request(event_id=None, recipient="01012345678", event_type="homepage-lead", params=None, mode="live", **extra):
    data = {"version": 3, "eventId": event_id or str(uuid.uuid4()), "mode": mode, "service": "oneulstart",
            "eventType": event_type, "recipient": recipient, "params": {} if params is None else params, **extra}
    body = json.dumps(data, separators=(",", ":")).encode()
    stamp = str(NOW)
    return {"x-oneul-time": stamp, "x-oneul-signature": signature(CONFIG["secret"], stamp, body)}, body


class CustomerRelayTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="oneul-sms-customer-")
        self.db = Path(self.temp.name) / "attempts.sqlite"
        self.sent = []
        def sender(config, event_type, recipient=None, message=None):
            self.sent.append((event_type, recipient, message))
            return {"status": "accepted", "code": "PROVIDER_ACCEPTED", "receiptId": str(len(self.sent))}
        self.relay = Relay(CUSTOMER, self.db, sender, lambda: NOW)

    def tearDown(self):
        self.temp.cleanup()

    def test_fixed_templates_fit_one_sms(self):
        self.assertEqual(customer_message("homepage-lead", {}), "[오늘창업] 홈페이지에 새 문의가 들어왔어요. 확인: oneulstart.com/plan/homepage")
        biggest = customer_message("weekly-report", {"leads": 9999, "prevLeads": 9999, "views": 99999})
        self.assertLessEqual(sms_bytes(biggest), 90)
        self.assertLessEqual(sms_bytes(customer_message("homepage-lead", {})), 90)
        self.assertEqual(customer_message("weekly-report", {"leads": 3, "prevLeads": 1, "views": 42}), "[오늘창업] 지난주 문의 3건(전주 1건) 방문 42회 oneulstart.com/plan/homepage")
        for bad in [{"leads": "3", "prevLeads": 1, "views": 1}, {"leads": -1, "prevLeads": 1, "views": 1}, {"leads": 1, "prevLeads": 1}, {"leads": 1, "prevLeads": 1, "views": 1, "msg": 1}, {"leads": True, "prevLeads": 1, "views": 1}]:
            self.assertIsNone(customer_message("weekly-report", bad))
        self.assertIsNone(customer_message("homepage-lead", {"name": "x"}), "자유 글은 받지 않는다")
        self.assertIsNone(customer_message("support-inquiry", {}))

    def test_sends_only_fixed_text_to_requested_owner_phone(self):
        status, result = self.relay.handle(PATH, *customer_request(event_type="weekly-report", params={"leads": 3, "prevLeads": 1, "views": 42}))
        self.assertEqual((status, result["status"], result["eventType"]), (200, "accepted", "weekly-report"))
        self.assertEqual(self.sent, [("weekly-report", "01012345678", "[오늘창업] 지난주 문의 3건(전주 1건) 방문 42회 oneulstart.com/plan/homepage")])

    def test_invalid_requests_never_send(self):
        for extra in [{"recipient": "0212345678"}, {"recipient": "010123"}, {"eventType": "support-inquiry"}, {"service": "other"},
                      {"params": {"text": "광고"}}, {"msg": "x"}, {"sender": "01099999999"}]:
            self.assertEqual(self.relay.handle(PATH, *customer_request(**extra))[0], 400, extra)
        headers, body = customer_request()
        self.assertEqual(self.relay.handle(PATH, headers, body + b" ")[0], 401, "서명이 맞아야 한다")
        self.assertEqual(self.relay.handle(PATH, *customer_request(mode="test"))[0], 409)
        self.assertEqual(self.sent, [])

    def test_disabled_by_default_and_requires_sender_and_limits(self):
        relay = Relay(CONFIG, Path(self.temp.name) / "plain.sqlite", lambda *args: {"status": "accepted", "code": "PROVIDER_ACCEPTED"}, lambda: NOW)
        self.assertEqual(relay.handle(PATH, *customer_request())[1]["code"], "CUSTOMER_SMS_DISABLED", "설정에 켜지 않으면 보내지 않는다")
        off = Relay({**CUSTOMER, "enabled": False}, Path(self.temp.name) / "off.sqlite", lambda *args: {"status": "accepted"}, lambda: NOW)
        self.assertEqual(off.handle(PATH, *customer_request())[1]["code"], "CUSTOMER_SMS_DISABLED")
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "config.json"
            for broken in [{"customerSender": "abc"}, {"customerDailyLimit": 0}, {"perRecipientDailyLimit": 99}, {"customerEnabled": "yes"}]:
                path.write_text(json.dumps({**CUSTOMER, **broken})); path.chmod(0o600)
                with self.assertRaises(ValueError):
                    load_config(path)
            path.write_text(json.dumps(CUSTOMER)); path.chmod(0o600)
            self.assertTrue(load_config(path)["customerEnabled"])

    def test_per_recipient_and_daily_caps_and_owner_counter_is_separate(self):
        for _ in range(2):
            self.assertEqual(self.relay.handle(PATH, *customer_request())[0], 200)
        self.assertEqual(self.relay.handle(PATH, *customer_request())[1]["code"], "RECIPIENT_DAILY_LIMIT_REACHED")
        for phone in ["01011112222", "01033334444", "01055556666"]:
            self.relay.handle(PATH, *customer_request(recipient=phone))
        self.assertEqual(self.relay.handle(PATH, *customer_request(recipient="01077778888"))[1]["code"], "CUSTOMER_DAILY_LIMIT_REACHED")
        self.assertEqual(len(self.sent), 5)
        # 대표 알림 한도(10)는 사장님 알림이 다 써도 그대로
        owner_sent = []
        relay = Relay(CUSTOMER, self.db, lambda config, event_type, *rest: owner_sent.append(event_type) or {"status": "accepted", "code": "PROVIDER_ACCEPTED"}, lambda: NOW)
        self.assertEqual(relay.handle(PATH, *request())[0], 200)
        self.assertEqual(owner_sent, ["support-inquiry"])

    def test_duplicate_event_never_resends(self):
        event = str(uuid.uuid4())
        self.assertFalse(self.relay.handle(PATH, *customer_request(event_id=event))[1]["duplicate"])
        again = self.relay.handle(PATH, *customer_request(event_id=event))[1]
        self.assertTrue(again["duplicate"])
        self.assertEqual(self.relay.handle(PATH, *customer_request(event_id=event, recipient="01099998888"))[1]["code"], "EVENT_CONFLICT")
        self.assertEqual(len(self.sent), 1)

    def test_existing_database_is_migrated(self):
        import sqlite3
        path = Path(self.temp.name) / "old.sqlite"
        db = sqlite3.connect(path)
        db.execute("""CREATE TABLE attempts (event_id TEXT PRIMARY KEY, body_hash TEXT NOT NULL, mode TEXT NOT NULL,
              day INTEGER NOT NULL, status TEXT NOT NULL, code TEXT NOT NULL, receipt_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)""")
        db.execute("INSERT INTO attempts VALUES ('old','h','live',?, 'accepted','PROVIDER_ACCEPTED',NULL,1,1)", (NOW // 86400,))
        db.commit(); db.close()
        relay = Relay(CUSTOMER, path, lambda *args: {"status": "accepted", "code": "PROVIDER_ACCEPTED"}, lambda: NOW)
        self.assertEqual(relay.handle(PATH, *customer_request())[0], 200)
        db = sqlite3.connect(path)
        self.assertEqual(db.execute("SELECT kind FROM attempts WHERE event_id='old'").fetchone()[0], "owner")
        db.close()

    def test_provider_uses_customer_sender_and_recipient(self):
        sent = []
        class Response:
            def __init__(self): self.chunks = [json.dumps({"result_code": "1", "msg_id": "77", "success_cnt": 1, "error_cnt": 0, "msg_type": "SMS"}).encode(), b""]
            def __enter__(self): return self
            def __exit__(self, *args): return False
            def read1(self, _size): return self.chunks.pop(0)
        class Opener:
            def open(self, request, timeout): sent.append(request); return Response()
        with patch("relay.urllib.request.build_opener", return_value=Opener()):
            message = customer_message("homepage-lead", {})
            self.assertEqual(aligo_send(CUSTOMER, "homepage-lead", "01012345678", message)["status"], "accepted")
            self.assertEqual(aligo_send(CUSTOMER, "homepage-lead", "0212345678", message)["code"], "CUSTOMER_MESSAGE_INVALID")
        import urllib.parse
        body = urllib.parse.parse_qs(sent[0].data.decode())
        self.assertEqual((body["sender"], body["receiver"], body["msg"], body["msg_type"]), (["0212345678"], ["01012345678"], [message], ["SMS"]))


V4 = {**CUSTOMER, "paymentEnabled": True, "customerDailyLimit": 50, "perRecipientDailyLimit": 5}
ORDER = "PB-mg1abc2d-0123456789ab"


def v4_request(event_type, params, recipient="01012345678", event_id=None, mode="live", extra=None, **more):
    data = {"version": 4, "eventId": event_id or str(uuid.uuid4()), "mode": mode, "service": "oneulstart", "eventType": event_type, "params": params}
    if event_type in ("payment-paid",):
        data["recipientCheck"] = hmac.new(CONFIG["secret"].encode(), ("recipient:" + CONFIG["ownerPhone"]).encode(), hashlib.sha256).hexdigest()
    else:
        data["recipient"] = recipient
    data.update(extra or {})
    data.update(more)
    body = json.dumps(data, separators=(",", ":")).encode()
    stamp = str(NOW)
    return {"x-oneul-time": stamp, "x-oneul-signature": signature(CONFIG["secret"], stamp, body)}, body


class V4RelayTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="oneul-sms-v4-")
        self.db = Path(self.temp.name) / "attempts.sqlite"
        self.sent = []
        def sender(config, event_type, recipient=None, message=None):
            self.sent.append((event_type, recipient, message))
            return {"status": "accepted", "code": "PROVIDER_ACCEPTED", "receiptId": str(len(self.sent))}
        self.relay = Relay(V4, self.db, sender, lambda: NOW)

    def tearDown(self):
        self.temp.cleanup()

    def test_templates(self):
        self.assertEqual(v4_message("payment-paid", {"product": "bundle", "amount": 99000, "orderId": ORDER}), "[오늘창업] 결제 계획서+홈페이지 99,000원 " + ORDER)
        self.assertEqual(v4_message("payment-receipt", {"product": "plan", "orderId": ORDER}), "[오늘창업] 결제 완료 사업계획서 주문 " + ORDER)
        self.assertEqual(v4_message("homepage-lead-contact", {"name": "김 철수<script>", "phone": "01012345678"}), "[오늘창업] 새 문의 김 철수script 01012345678 확인 oneulstart.com/plan/homepage")
        self.assertEqual(v4_message("homepage-lead-contact", {"name": "!!!", "phone": ""}), "[오늘창업] 새 문의 이름 없음 확인 oneulstart.com/plan/homepage")
        self.assertEqual(v4_message("lead-received", {"store": "오늘 카페\n☎ 010"}), "[오늘 카페 010] 문의가 접수됐어요. 곧 연락드릴게요.")
        self.assertEqual(v4_message("domain-connect-started", {"domain": "www.mybrand.co.kr"}), "[오늘창업] 도메인 www.mybrand.co.kr 연결을 시작했어요")
        self.assertEqual(v4_message("tax-deadline", {"kind": "income", "days": 7, "month": 5, "day": 31}), "[오늘창업] 종합소득세 신고 마감 D-7 (5/31)")
        # 완성형에 없는 한글은 빼고, 이름은 10자·가게 이름은 12자까지
        self.assertEqual(v4_message("homepage-lead-contact", {"name": "똠양꿍" + "가" * 20, "phone": ""}).split(" ")[3], "양꿍" + "가" * 8)
        self.assertEqual(v4_message("lead-received", {"store": "가" * 30}), "[" + "가" * 12 + "] 문의가 접수됐어요. 곧 연락드릴게요.")
        for event, bad in [("payment-paid", {"product": "other", "amount": 1, "orderId": ORDER}), ("payment-paid", {"product": "plan", "amount": "1", "orderId": ORDER}),
                           ("payment-paid", {"product": "plan", "amount": 0, "orderId": ORDER}), ("payment-paid", {"product": "plan", "amount": True, "orderId": ORDER}),
                           ("payment-receipt", {"product": "plan", "orderId": "PB-광고-x"}), ("payment-receipt", {"product": "plan", "orderId": ORDER, "msg": "x"}),
                           ("homepage-lead-contact", {"name": "a", "phone": "010-1234-5678"}), ("homepage-lead-contact", {"name": "a" * 101, "phone": ""}),
                           ("homepage-lead-contact", {"name": 1, "phone": ""}), ("lead-received", {"store": "!!!"}), ("lead-received", {}),
                           ("domain-connect-started", {"domain": "evil.example.org"}), ("domain-connect-started", {"domain": "a.com/광고"}),
                           ("tax-deadline", {"kind": "income", "days": 3, "month": 5, "day": 31}), ("tax-deadline", {"kind": "corp", "days": 1, "month": 5, "day": 31}),
                           ("tax-deadline", {"kind": "vat", "days": 1, "month": 13, "day": 1}), ("support-inquiry", {})]:
            self.assertIsNone(v4_message(event, bad), (event, bad))

    def test_sizes_sms_or_lms(self):
        self.assertLessEqual(sms_bytes(v4_message("tax-deadline", {"kind": "income", "days": 7, "month": 12, "day": 31})), 90)
        self.assertLessEqual(sms_bytes(v4_message("lead-received", {"store": "가" * 12})), 90, "방문자 확인 문자는 늘 SMS")
        self.assertLessEqual(sms_bytes(v4_message("homepage-lead-contact", {"name": "가" * 10, "phone": "01012345678"})), 90, "이름 10자·번호 11자리여도 SMS")
        self.assertLessEqual(sms_bytes(v4_message("payment-paid", {"product": "bundle", "amount": 10000000, "orderId": ORDER})), 90)
        self.assertLessEqual(sms_bytes(v4_message("payment-receipt", {"product": "bundle", "orderId": ORDER})), 90)
        longest = v4_message("domain-connect-started", {"domain": "www." + "a" * 61 + ".co.kr"})
        self.assertGreater(sms_bytes(longest), 90)
        self.assertTrue(message_fits("domain-connect-started", longest), "길면 LMS")
        self.assertFalse(message_fits("lead-received", "가" * 50), "LMS 가 아닌 이벤트는 90바이트까지만")

    def test_sends_each_event_to_the_right_phone(self):
        cases = [("payment-paid", {"product": "plan", "amount": 49000, "orderId": ORDER}, None),
                 ("payment-receipt", {"product": "plan", "orderId": ORDER}, "01012345678"),
                 ("homepage-lead-contact", {"name": "김철수", "phone": "01099998888"}, "01012345678"),
                 ("lead-received", {"store": "오늘카페"}, "01099998888"),
                 ("domain-connect-started", {"domain": "www.mybrand.com"}, "01012345678"),
                 ("tax-deadline", {"kind": "vat", "days": 1, "month": 7, "day": 27}, "01012345678")]
        for event, params, recipient in cases:
            status, result = self.relay.handle(PATH, *v4_request(event, params, recipient=recipient or "01012345678"))
            self.assertEqual((status, result["status"], result["eventType"]), (200, "accepted", event), event)
        self.assertEqual([(event, recipient) for event, recipient, _ in self.sent], [(event, recipient) for event, _, recipient in cases])
        self.assertEqual(self.sent[0][2], "[오늘창업] 결제 사업계획서 49,000원 " + ORDER)

    def test_invalid_requests_and_opt_ins(self):
        for args in [("payment-paid", {"product": "plan", "amount": 1, "orderId": ORDER}, "01012345678", None, "live", {"recipient": "01012345678"}),
                     ("lead-received", {"store": "카페"}, "0212345678", None, "live", {}),
                     ("lead-received", {"store": "카페"}, "01012345678", None, "live", {"msg": "광고"}),
                     ("lead-received", {"store": "카페"}, "01012345678", None, "live", {"service": "other"}),
                     ("unknown-event", {}, "01012345678", None, "live", {})]:
            event, params, recipient, event_id, mode, extra = args
            self.assertEqual(self.relay.handle(PATH, *v4_request(event, params, recipient, event_id, mode, extra))[0], 400, args)
        wrong = v4_request("payment-paid", {"product": "plan", "amount": 1, "orderId": ORDER}, recipientCheck="0" * 64)
        self.assertEqual(self.relay.handle(PATH, *wrong)[1]["code"], "PRIVATE_CONFIG_MISMATCH")
        self.assertEqual(self.relay.handle(PATH, *v4_request("lead-received", {"store": "카페"}, mode="test"))[0], 409)
        paused = Relay({**V4, "paymentEnabled": False}, Path(self.temp.name) / "p.sqlite", lambda *a: {"status": "accepted", "code": "PROVIDER_ACCEPTED"}, lambda: NOW)
        self.assertEqual(paused.handle(PATH, *v4_request("payment-paid", {"product": "plan", "amount": 1, "orderId": ORDER}))[1]["code"], "PAYMENT_SMS_DISABLED", "결제 알림은 따로 켠다")
        no_customer = Relay(CONFIG, Path(self.temp.name) / "c.sqlite", lambda *a: {"status": "accepted", "code": "PROVIDER_ACCEPTED"}, lambda: NOW)
        self.assertEqual(no_customer.handle(PATH, *v4_request("tax-deadline", {"kind": "vat", "days": 1, "month": 1, "day": 25}))[1]["code"], "CUSTOMER_SMS_DISABLED")
        self.assertEqual(self.sent, [])

    def test_duplicates_and_limits(self):
        headers, body = v4_request("payment-receipt", {"product": "plan", "orderId": ORDER})
        self.assertFalse(self.relay.handle(PATH, headers, body)[1]["duplicate"])
        self.assertTrue(self.relay.handle(PATH, headers, body)[1]["duplicate"], "같은 주문의 문자는 한 번")
        for _ in range(4):
            self.relay.handle(PATH, *v4_request("lead-received", {"store": "카페"}))
        self.assertEqual(self.relay.handle(PATH, *v4_request("lead-received", {"store": "카페"}))[1]["code"], "RECIPIENT_DAILY_LIMIT_REACHED", "같은 번호는 하루 한도까지")
        limited = Relay({**V4, "dailyLimit": 1}, self.db, lambda *a: {"status": "accepted", "code": "PROVIDER_ACCEPTED"}, lambda: NOW)
        self.assertEqual(limited.handle(PATH, *v4_request("payment-paid", {"product": "plan", "amount": 1, "orderId": ORDER}))[0], 200)
        self.assertEqual(limited.handle(PATH, *v4_request("payment-paid", {"product": "plan", "amount": 1, "orderId": ORDER}))[1]["code"], "DAILY_LIMIT_REACHED", "운영자 결제 알림은 dailyLimit 을 쓴다")

    def test_provider_uses_lms_with_fixed_title_only_when_long(self):
        sent = []
        class Response:
            def __init__(self, kind): self.chunks = [json.dumps({"result_code": "1", "msg_id": "9", "success_cnt": 1, "error_cnt": 0, "msg_type": kind}).encode(), b""]
            def __enter__(self): return self
            def __exit__(self, *args): return False
            def read1(self, _size): return self.chunks.pop(0)
        class Opener:
            def open(self, request, timeout):
                sent.append(request)
                return Response(urllib.parse.parse_qs(request.data.decode())["msg_type"][0])
        import urllib.parse
        long_text = v4_message("domain-connect-started", {"domain": "www." + "a" * 61 + ".co.kr"})
        with patch("relay.urllib.request.build_opener", return_value=Opener()):
            self.assertEqual(aligo_send(V4, "domain-connect-started", "01012345678", long_text)["status"], "accepted")
            self.assertEqual(aligo_send(V4, "payment-paid", None, "[오늘창업] 결제 사업계획서 49,000원 " + ORDER)["status"], "accepted")
            self.assertEqual(aligo_send(V4, "lead-received", "01012345678", "가" * 50)["code"], "CUSTOMER_MESSAGE_INVALID")
            self.assertEqual(aligo_send(V4, "payment-paid", "01012345678", None)["code"], "CUSTOMER_MESSAGE_INVALID")
            self.assertEqual(aligo_send(V4, "support-inquiry", None, "임의 문구")["code"], "EVENT_TYPE_INVALID", "v1 이벤트에는 문구를 받지 않는다")
        lms = urllib.parse.parse_qs(sent[0].data.decode())
        self.assertEqual((lms["msg_type"], lms["title"], lms["sender"]), (["LMS"], ["오늘창업 알림"], [V4["customerSender"]]))
        sms = urllib.parse.parse_qs(sent[1].data.decode())
        self.assertEqual((sms["msg_type"], sms["sender"], sms["receiver"]), (["SMS"], [CONFIG["ownerPhone"]], [CONFIG["ownerPhone"]]))
        self.assertNotIn("title", sms)


if __name__ == "__main__":
    unittest.main(verbosity=2)
