"""Oneulstart-only Aligo relay. Standard library; no customer inquiry content.

v1/v2: fixed owner alerts. v3: fixed-template alerts to a homepage owner's own phone (opt-in, capped)."""
import hashlib
import hmac
import json
import os
import re
import sqlite3
import ssl
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from contextlib import contextmanager

PATH = "/_oneulstart/support-owner-sms"
PROVIDER = "https://apis.aligo.in/send/"
MESSAGE = "[오늘창업] 새 고객센터 문의가 접수됐습니다."
MESSAGES = {
    "support-inquiry": MESSAGE,
    "business-plan-ready": "[오늘창업] 새 사업안 생성과 저장이 완료됐습니다.",
}
# 사장님(고객) 알림 — 받는 번호만 요청에서 받고, 글은 여기 고정 문구로만 만든다(숫자 외 자유 글 없음).
CUSTOMER_EVENTS = ("homepage-lead", "weekly-report")
SITE = "oneulstart.com/plan/homepage"
MAX_SMS_BYTES = 90
MAX_BODY = 2048
MAX_RECEIPT = 16384


def signature(secret, timestamp, body):
    value = timestamp.encode() + b"\nPOST\n" + PATH.encode() + b"\n" + body
    return hmac.new(secret.encode(), value, hashlib.sha256).hexdigest()


def load_config(path):
    file = Path(path)
    if file.stat().st_mode & 0o077:
        raise ValueError("PRIVATE_CONFIG_PERMISSIONS_REQUIRED")
    config = json.loads(file.read_text())
    if not re.fullmatch(r"[A-Za-z0-9_-]{43,128}", config.get("secret", "")):
        raise ValueError("SIGNING_SECRET_REQUIRED")
    if not re.fullmatch(r"010\d{8}", config.get("ownerPhone", "")):
        raise ValueError("SINGLE_OWNER_PHONE_REQUIRED")
    if not re.fullmatch(r"[A-Za-z0-9_-]{8,128}", config.get("aligoKey", "")):
        raise ValueError("ALIGO_KEY_REQUIRED")
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.@-]{1,79}", config.get("aligoUser", "")):
        raise ValueError("ALIGO_USER_REQUIRED")
    if config.get("mode") not in ("test", "live") or type(config.get("dailyLimit")) is not int or not 1 <= config["dailyLimit"] <= 10:
        raise ValueError("APPROVED_LIMIT_AND_MODE_REQUIRED")
    if type(config.get("enabled")) is not bool:
        raise ValueError("EXPLICIT_ENABLE_REQUIRED")
    if "reportReadyEnabled" in config and type(config["reportReadyEnabled"]) is not bool:
        raise ValueError("EXPLICIT_REPORT_ENABLE_REQUIRED")
    if "customerEnabled" in config:
        if type(config["customerEnabled"]) is not bool:
            raise ValueError("EXPLICIT_CUSTOMER_ENABLE_REQUIRED")
        if config["customerEnabled"]:
            # 사장님께 보이는 발신번호 — 알리고에 미리 등록한 번호여야 한다(대표 개인 번호를 쓸지는 운영자가 정한다)
            if not re.fullmatch(r"0\d{8,10}|1\d{7}", str(config.get("customerSender", ""))):
                raise ValueError("CUSTOMER_SENDER_REQUIRED")
            if type(config.get("customerDailyLimit")) is not int or not 1 <= config["customerDailyLimit"] <= 5000:
                raise ValueError("CUSTOMER_DAILY_LIMIT_REQUIRED")
            if type(config.get("perRecipientDailyLimit")) is not int or not 1 <= config["perRecipientDailyLimit"] <= 50:
                raise ValueError("PER_RECIPIENT_LIMIT_REQUIRED")
    return config


def sms_bytes(text):
    return len(text.encode("euc-kr"))


def customer_message(event_type, params):
    """Fixed templates only. Returns None when params are not exactly the allowed numbers."""
    if not isinstance(params, dict):
        return None
    if event_type == "homepage-lead":
        if params:
            return None
        return "[오늘창업] 홈페이지에 새 문의가 들어왔어요. 확인: " + SITE
    if event_type == "weekly-report":
        limits = {"leads": 9999, "prevLeads": 9999, "views": 99999}
        if set(params) != set(limits) or any(type(params[key]) is not int or not 0 <= params[key] <= top for key, top in limits.items()):
            return None
        return "[오늘창업] 지난주 문의 %d건(전주 %d건) 방문 %d회 %s" % (params["leads"], params["prevLeads"], params["views"], SITE)
    return None


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise ValueError("PROVIDER_REDIRECT_DENIED")


def receipt_integer(value):
    # Aligo returns decimal strings for some fields documented as Integer.
    if type(value) is int and abs(value) <= 2 ** 63 - 1:
        return value
    if isinstance(value, str) and re.fullmatch(r"-?[0-9]{1,18}", value):
        return int(value)
    return None


def aligo_send(config, event_type="support-inquiry", recipient=None, message=None):
    if recipient is None:
        if event_type not in MESSAGES:
            return {"status": "rejected", "code": "EVENT_TYPE_INVALID"}
        sender, receiver, text = config["ownerPhone"], config["ownerPhone"], MESSAGES[event_type]
    else:
        if (event_type not in CUSTOMER_EVENTS or not re.fullmatch(r"010\d{8}", recipient)
                or not isinstance(message, str) or sms_bytes(message) > MAX_SMS_BYTES):
            return {"status": "rejected", "code": "CUSTOMER_MESSAGE_INVALID"}
        sender, receiver, text = config["customerSender"], recipient, message
    body = urllib.parse.urlencode({
        "key": config["aligoKey"], "user_id": config["aligoUser"],
        "sender": sender, "receiver": receiver,
        "msg": text, "msg_type": "SMS", "testmode_yn": "Y" if config["mode"] == "test" else "N",
    }).encode()
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect(),
                                        urllib.request.HTTPSHandler(context=ssl.create_default_context()))
    request = urllib.request.Request(PROVIDER, data=body, method="POST",
                                     headers={"Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"})
    started = time.monotonic()
    try:
        with opener.open(request, timeout=4) as response:
            chunks, size = [], 0
            while True:
                if time.monotonic() - started >= 4:
                    raise TimeoutError("PROVIDER_DEADLINE")
                chunk = response.read1(4096)
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_RECEIPT:
                    raise ValueError("RECEIPT_TOO_LARGE")
                chunks.append(chunk)
            receipt = json.loads(b"".join(chunks))
    except urllib.error.HTTPError as error:
        error.close()
        return {"status": "rejected" if 400 <= error.code < 500 else "uncertain", "code": "PROVIDER_HTTP_" + str(error.code)}
    except Exception:
        return {"status": "uncertain", "code": "PROVIDER_UNCONFIRMED"}
    if not isinstance(receipt, dict):
        return {"status": "uncertain", "code": "INVALID_PROVIDER_RECEIPT"}
    code, message_id, success, errors = (receipt_integer(receipt.get(field))
                                        for field in ("result_code", "msg_id", "success_cnt", "error_cnt"))
    if code is None:
        return {"status": "uncertain", "code": "INVALID_PROVIDER_RECEIPT"}
    if code < 0:
        return {"status": "rejected", "code": "ALIGO_REJECTED_" + str(code)}
    if (code != 1 or message_id is None or message_id <= 0
            or success != 1 or errors != 0 or receipt.get("msg_type") != "SMS"):
        return {"status": "uncertain", "code": "UNCONFIRMED_PROVIDER_RECEIPT"}
    return {"status": "test_accepted" if config["mode"] == "test" else "accepted",
            "code": "ALIGO_TEST_ACCEPTED" if config["mode"] == "test" else "PROVIDER_ACCEPTED",
            "receiptId": str(message_id)}


class Relay:
    def __init__(self, config, db_path, sender=aligo_send, clock=time.time):
        self.config, self.db_path, self.sender, self.clock = config, str(db_path), sender, clock
        with self.connect() as db:
            db.execute("PRAGMA journal_mode=WAL")
            db.execute("""CREATE TABLE IF NOT EXISTS attempts (
              event_id TEXT PRIMARY KEY, body_hash TEXT NOT NULL, mode TEXT NOT NULL,
              day INTEGER NOT NULL, status TEXT NOT NULL, code TEXT NOT NULL,
              receipt_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)""")
            # v3: 사장님 알림을 대표 알림과 따로 센다 — 기존 줄은 모두 대표(owner) 알림
            columns = {row[1] for row in db.execute("PRAGMA table_info(attempts)")}
            if "kind" not in columns:
                db.execute("ALTER TABLE attempts ADD COLUMN kind TEXT NOT NULL DEFAULT 'owner'")
            if "recipient_hash" not in columns:
                db.execute("ALTER TABLE attempts ADD COLUMN recipient_hash TEXT")
        os.chmod(self.db_path, 0o600)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.db_path, timeout=2, isolation_level=None)
        try:
            yield db
        finally:
            db.close()

    def handle(self, path, headers, body):
        if path != PATH:
            return 404, {"status": "blocked", "code": "NOT_FOUND"}
        if len(body) > MAX_BODY:
            return 413, {"status": "blocked", "code": "BODY_TOO_LARGE"}
        stamp, supplied = headers.get("x-oneul-time", ""), headers.get("x-oneul-signature", "")
        if (not re.fullmatch(r"\d{10}", stamp) or abs(self.clock() - int(stamp)) > 60
                or not re.fullmatch(r"[a-f0-9]{64}", supplied)
                or not hmac.compare_digest(supplied, signature(self.config["secret"], stamp, body))):
            return 401, {"status": "blocked", "code": "SIGNATURE_INVALID"}
        try:
            data = json.loads(body)
            if not isinstance(data, dict) or type(data.get("version")) is not int or data["version"] not in (1, 2, 3):
                raise ValueError()
            if data["version"] == 3:
                return self.handle_customer(data, body)
            expected = {"version", "eventId", "mode", "recipientCheck"}
            event_type = "support-inquiry"
            if data["version"] == 2:
                expected |= {"service", "eventType"}
                if data.get("service") != "oneulstart" or data.get("eventType") != "business-plan-ready":
                    raise ValueError()
                event_type = data["eventType"]
            if set(data) != expected or not re.fullmatch(r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}", data["eventId"]):
                raise ValueError()
            check = hmac.new(self.config["secret"].encode(), ("recipient:" + self.config["ownerPhone"]).encode(), hashlib.sha256).hexdigest()
            if data["mode"] != self.config["mode"] or not isinstance(data["recipientCheck"], str) or not hmac.compare_digest(data["recipientCheck"], check):
                return 409, {"status": "blocked", "code": "PRIVATE_CONFIG_MISMATCH"}
        except (ValueError, TypeError, KeyError):
            return 400, {"status": "blocked", "code": "INVALID_REQUEST"}
        if not self.config["enabled"]:
            return 503, {"status": "blocked", "code": "SMS_DISABLED"}
        if event_type == "business-plan-ready" and self.config.get("reportReadyEnabled") is not True:
            return 503, {"status": "blocked", "code": "REPORT_SMS_DISABLED"}
        event_id, digest, now = data["eventId"], hashlib.sha256(body).hexdigest(), int(self.clock())
        base = {"eventId": event_id, "mode": data["mode"]}
        if data["version"] == 2:
            base["eventType"] = event_type
        try:
            with self.connect() as db:
                db.execute("BEGIN IMMEDIATE")
                old = db.execute("SELECT body_hash,status,code FROM attempts WHERE event_id=?", (event_id,)).fetchone()
                if old:
                    db.commit()
                    if old[0] != digest:
                        return 409, {**base, "status": "blocked", "code": "EVENT_CONFLICT"}
                    return 200, {**base, "status": old[1], "code": old[2], "duplicate": True}
                day = now // 86400
                used = db.execute("SELECT count(*) FROM attempts WHERE day=? AND kind='owner'", (day,)).fetchone()[0]
                if used >= self.config["dailyLimit"]:
                    db.commit()
                    return 429, {**base, "status": "blocked", "code": "DAILY_LIMIT_REACHED"}
                db.execute("INSERT INTO attempts (event_id,body_hash,mode,day,status,code,receipt_id,created_at,updated_at,kind) VALUES (?,?,?,?,?,?,NULL,?,?,'owner')",
                           (event_id, digest, data["mode"], day, "uncertain", "ATTEMPT_IN_PROGRESS_OR_INTERRUPTED", now, now))
                db.commit()
        except sqlite3.Error:
            return 503, {**base, "status": "blocked", "code": "DURABLE_LIMIT_UNAVAILABLE"}
        try:
            receipt = self.sender(self.config, event_type)
            if receipt.get("status") not in {"accepted", "test_accepted", "rejected", "uncertain"}:
                raise ValueError()
        except Exception:
            receipt = {"status": "uncertain", "code": "PROVIDER_UNCONFIRMED"}
        try:
            with self.connect() as db:
                db.execute("UPDATE attempts SET status=?,code=?,receipt_id=?,updated_at=? WHERE event_id=?",
                           (receipt["status"], receipt["code"], receipt.get("receiptId"), int(self.clock()), event_id))
        except sqlite3.Error:
            return 503, {**base, "status": "uncertain", "code": "RECEIPT_STORE_UNCONFIRMED"}
        return 200, {**base, "status": receipt["status"], "code": receipt["code"], "duplicate": False}

    def handle_customer(self, data, body):
        """v3 — 사장님 휴대폰으로 고정 문구 하나. 서명은 이미 확인됐다."""
        expected = {"version", "eventId", "mode", "service", "eventType", "recipient", "params"}
        if (set(data) != expected or data.get("service") != "oneulstart" or data.get("eventType") not in CUSTOMER_EVENTS
                or not isinstance(data.get("eventId"), str)
                or not re.fullmatch(r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}", data["eventId"])
                or not isinstance(data.get("recipient"), str) or not re.fullmatch(r"010\d{8}", data["recipient"])):
            return 400, {"status": "blocked", "code": "INVALID_REQUEST"}
        message = customer_message(data["eventType"], data["params"])
        if message is None or sms_bytes(message) > MAX_SMS_BYTES:
            return 400, {"status": "blocked", "code": "INVALID_REQUEST"}
        event_type, event_id = data["eventType"], data["eventId"]
        base = {"eventId": event_id, "mode": data["mode"], "eventType": event_type}
        if data["mode"] != self.config["mode"]:
            return 409, {**base, "status": "blocked", "code": "PRIVATE_CONFIG_MISMATCH"}
        if not self.config["enabled"] or self.config.get("customerEnabled") is not True:
            return 503, {**base, "status": "blocked", "code": "CUSTOMER_SMS_DISABLED"}
        digest, now = hashlib.sha256(body).hexdigest(), int(self.clock())
        recipient_hash = hmac.new(self.config["secret"].encode(), ("customer:" + data["recipient"]).encode(), hashlib.sha256).hexdigest()
        try:
            with self.connect() as db:
                db.execute("BEGIN IMMEDIATE")
                old = db.execute("SELECT body_hash,status,code FROM attempts WHERE event_id=?", (event_id,)).fetchone()
                if old:
                    db.commit()
                    if old[0] != digest:
                        return 409, {**base, "status": "blocked", "code": "EVENT_CONFLICT"}
                    return 200, {**base, "status": old[1], "code": old[2], "duplicate": True}
                day = now // 86400
                used = db.execute("SELECT count(*) FROM attempts WHERE day=? AND kind='customer'", (day,)).fetchone()[0]
                if used >= self.config["customerDailyLimit"]:
                    db.commit()
                    return 429, {**base, "status": "blocked", "code": "CUSTOMER_DAILY_LIMIT_REACHED"}
                mine = db.execute("SELECT count(*) FROM attempts WHERE day=? AND kind='customer' AND recipient_hash=?", (day, recipient_hash)).fetchone()[0]
                if mine >= self.config["perRecipientDailyLimit"]:
                    db.commit()
                    return 429, {**base, "status": "blocked", "code": "RECIPIENT_DAILY_LIMIT_REACHED"}
                db.execute("INSERT INTO attempts (event_id,body_hash,mode,day,status,code,receipt_id,created_at,updated_at,kind,recipient_hash) VALUES (?,?,?,?,?,?,NULL,?,?,'customer',?)",
                           (event_id, digest, data["mode"], day, "uncertain", "ATTEMPT_IN_PROGRESS_OR_INTERRUPTED", now, now, recipient_hash))
                db.commit()
        except sqlite3.Error:
            return 503, {**base, "status": "blocked", "code": "DURABLE_LIMIT_UNAVAILABLE"}
        try:
            receipt = self.sender(self.config, event_type, data["recipient"], message)
            if receipt.get("status") not in {"accepted", "test_accepted", "rejected", "uncertain"}:
                raise ValueError()
        except Exception:
            receipt = {"status": "uncertain", "code": "PROVIDER_UNCONFIRMED"}
        try:
            with self.connect() as db:
                db.execute("UPDATE attempts SET status=?,code=?,receipt_id=?,updated_at=? WHERE event_id=?",
                           (receipt["status"], receipt["code"], receipt.get("receiptId"), int(self.clock()), event_id))
        except sqlite3.Error:
            return 503, {**base, "status": "uncertain", "code": "RECEIPT_STORE_UNCONFIRMED"}
        return 200, {**base, "status": receipt["status"], "code": receipt["code"], "duplicate": False}


def serve(config_path, db_path, port):
    relay = Relay(load_config(config_path), db_path)
    slots = threading.BoundedSemaphore(4)

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def reply(self, status, data):
            body = json.dumps(data, separators=(",", ":")).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_POST(self):
            if not slots.acquire(blocking=False):
                self.reply(503, {"status": "blocked", "code": "BUSY"})
                return
            try:
                self.connection.settimeout(5)
                length = self.headers.get("Content-Length", "")
                if not re.fullmatch(r"\d{1,4}", length) or not 0 < int(length) <= MAX_BODY or self.headers.get("Transfer-Encoding"):
                    self.reply(400, {"status": "blocked", "code": "INVALID_LENGTH"})
                    return
                body = self.rfile.read(int(length))
                if len(body) != int(length):
                    return
                status, result = relay.handle(self.path, {key.lower(): value for key, value in self.headers.items()}, body)
                self.reply(status, result)
            except (OSError, ValueError):
                pass
            finally:
                slots.release()

        def do_GET(self):
            self.reply(405, {"status": "blocked", "code": "METHOD_NOT_ALLOWED"})

    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    server.daemon_threads = True
    server.serve_forever()


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    parser.add_argument("--db", required=True)
    parser.add_argument("--port", type=int, default=18189)
    args = parser.parse_args()
    os.umask(0o077)
    serve(args.config, args.db, args.port)
