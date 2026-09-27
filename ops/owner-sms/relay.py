"""Oneulstart-only Aligo relay. Standard library; no customer inquiry content."""
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
    return config


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


def aligo_send(config, event_type="support-inquiry"):
    if event_type not in MESSAGES:
        return {"status": "rejected", "code": "EVENT_TYPE_INVALID"}
    body = urllib.parse.urlencode({
        "key": config["aligoKey"], "user_id": config["aligoUser"],
        "sender": config["ownerPhone"], "receiver": config["ownerPhone"],
        "msg": MESSAGES[event_type], "msg_type": "SMS", "testmode_yn": "Y" if config["mode"] == "test" else "N",
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
            if not isinstance(data, dict) or type(data.get("version")) is not int or data["version"] not in (1, 2):
                raise ValueError()
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
                used = db.execute("SELECT count(*) FROM attempts WHERE day=?", (day,)).fetchone()[0]
                if used >= self.config["dailyLimit"]:
                    db.commit()
                    return 429, {**base, "status": "blocked", "code": "DAILY_LIMIT_REACHED"}
                db.execute("INSERT INTO attempts VALUES (?,?,?,?,?,?,NULL,?,?)",
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
