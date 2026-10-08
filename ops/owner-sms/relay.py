"""Oneulstart-only Aligo relay. Standard library; no customer inquiry content.

v1/v2: fixed owner alerts. v3: fixed-template alerts to a homepage owner's own phone (opt-in, capped).
v4: fixed templates filled only with strictly validated params (payment, lead contact, visitor receipt,
domain start, tax deadline). Long ones may go as LMS with a fixed title; v1-v3 bodies keep working unchanged."""
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
# 새 문의 문자는 '내 문의'로 바로 — 홈페이지 화면의 문의 목록은 그리로 옮겼다(가장 긴 문자도 86바이트, 90 안)
INQUIRIES = "oneulstart.com/plan/inquiries"
MAX_SMS_BYTES = 90
# v4 — 운영자(ownerPhone) 알림과 받는 번호가 있는 알림. 문구는 v4_message 가 고정 틀에 검사한 값만 채운다.
OPERATOR_EVENTS = ("payment-paid",)
CUSTOMER_EVENTS_V4 = ("payment-receipt", "homepage-lead-contact", "lead-received", "domain-connect-started", "tax-deadline")
# 90바이트를 넘을 수 있는 것만 LMS 로(제목 고정). 나머지는 넘으면 보내지 않는다
LMS_EVENTS = ("payment-paid", "payment-receipt", "homepage-lead-contact", "domain-connect-started")
MAX_LMS_BYTES = 2000
LMS_TITLE = "오늘창업 알림"
# 상품 이름은 요청에서 받지 않는다 — 열쇠만 받고 짧은 이름은 여기서 붙인다
PRODUCTS = {"plan": "사업계획서", "homepage": "홈페이지", "bundle": "계획서+홈페이지", "regen": "다시 생성 10회",
            "domain": "도메인 연결", "domain-purchase": "도메인 구매", "tokens": "AI 수정 토큰"}
TAX_KINDS = {"income": "종합소득세", "vat": "부가세"}
ORDER_ID = r"PB-[a-z0-9]{6,12}-[a-f0-9]{12}"
DOMAIN = r"(?:www\.)?[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(?:com|kr|co\.kr)"
EVENT_ID = r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}"
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
    # v4: 결제마다 운영자 문자가 가므로 상한을 10 → 200 으로 올렸다(실제 값은 운영자가 정한다)
    if config.get("mode") not in ("test", "live") or type(config.get("dailyLimit")) is not int or not 1 <= config["dailyLimit"] <= 200:
        raise ValueError("APPROVED_LIMIT_AND_MODE_REQUIRED")
    if type(config.get("enabled")) is not bool:
        raise ValueError("EXPLICIT_ENABLE_REQUIRED")
    if "reportReadyEnabled" in config and type(config["reportReadyEnabled"]) is not bool:
        raise ValueError("EXPLICIT_REPORT_ENABLE_REQUIRED")
    if "paymentEnabled" in config and type(config["paymentEnabled"]) is not bool:
        raise ValueError("EXPLICIT_PAYMENT_ENABLE_REQUIRED")
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
        return "[오늘창업] 홈페이지에 새 문의가 들어왔어요. 확인: " + INQUIRIES
    if event_type == "weekly-report":
        limits = {"leads": 9999, "prevLeads": 9999, "views": 99999}
        if set(params) != set(limits) or any(type(params[key]) is not int or not 0 <= params[key] <= top for key, top in limits.items()):
            return None
        return "[오늘창업] 지난주 문의 %d건(전주 %d건) 방문 %d회 %s" % (params["leads"], params["prevLeads"], params["views"], SITE)
    return None


def clean_text(value, limit, allowed):
    """이름·가게 이름 — 허용 글자(EUC-KR 로 보낼 수 있는 것)만 남기고 limit 글자로 자른다. 형식이 틀리면 None"""
    if not isinstance(value, str) or len(value) > 100:
        return None
    kept = []
    for char in re.sub(r"\s", " ", value):
        if not re.fullmatch(allowed, char):
            continue
        try:
            # 완성형에 없는 한글(예: 똠)은 8바이트 조합 표기가 되어 휴대폰에서 깨진다 — 2바이트 안인 글자만
            if len(char.encode("euc-kr")) > 2:
                continue
        except UnicodeEncodeError:
            continue
        kept.append(char)
    return re.sub(r" +", " ", "".join(kept)).strip()[:limit].strip()


def v4_message(event_type, params):
    """v4 고정 틀. 값이 정확히 허용된 모양이 아니면 None — 자유 글은 이름·가게 이름(걸러서)뿐이다."""
    if not isinstance(params, dict):
        return None
    keys = set(params)
    if event_type == "payment-paid":
        amount = params.get("amount")
        if (keys != {"product", "amount", "orderId"} or params["product"] not in PRODUCTS or type(amount) is not int
                or not 1 <= amount <= 10000000 or not isinstance(params["orderId"], str) or not re.fullmatch(ORDER_ID, params["orderId"])):
            return None
        return "[오늘창업] 결제 %s %s원 %s" % (PRODUCTS[params["product"]], format(amount, ","), params["orderId"])
    if event_type == "payment-receipt":
        if (keys != {"product", "orderId"} or params["product"] not in PRODUCTS
                or not isinstance(params["orderId"], str) or not re.fullmatch(ORDER_ID, params["orderId"])):
            return None
        return "[오늘창업] 결제 완료 %s 주문 %s" % (PRODUCTS[params["product"]], params["orderId"])
    if event_type == "homepage-lead-contact":
        if keys != {"name", "phone"} or not isinstance(params["phone"], str) or not re.fullmatch(r"(?:0\d{8,10})?", params["phone"]):
            return None
        name = clean_text(params["name"], 10, r"[가-힣A-Za-z ]")
        if name is None:
            return None
        return " ".join(["[오늘창업] 새 문의", name or "이름 없음"] + ([params["phone"]] if params["phone"] else []) + ["확인", INQUIRIES])
    if event_type == "lead-received":
        store = clean_text(params.get("store"), 12, r"[가-힣A-Za-z0-9 ]") if keys == {"store"} else None
        if not store:
            return None
        return "[%s] 문의가 접수됐어요. 곧 연락드릴게요." % store
    if event_type == "domain-connect-started":
        if keys != {"domain"} or not isinstance(params["domain"], str) or len(params["domain"]) > 80 or not re.fullmatch(DOMAIN, params["domain"]):
            return None
        return "[오늘창업] 도메인 %s 연결을 시작했어요" % params["domain"]
    if event_type == "tax-deadline":
        if (keys != {"kind", "days", "month", "day"} or params["kind"] not in TAX_KINDS
                or type(params["days"]) is not int or params["days"] not in (1, 7)
                or type(params["month"]) is not int or not 1 <= params["month"] <= 12
                or type(params["day"]) is not int or not 1 <= params["day"] <= 31):
            return None
        return "[오늘창업] %s 신고 마감 D-%d (%d/%d)" % (TAX_KINDS[params["kind"]], params["days"], params["month"], params["day"])
    return None


def message_fits(event_type, text):
    size = sms_bytes(text)
    return size <= MAX_SMS_BYTES or (event_type in LMS_EVENTS and size <= MAX_LMS_BYTES)


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
        if event_type in MESSAGES and message is None:
            text = MESSAGES[event_type]
        elif event_type in OPERATOR_EVENTS and isinstance(message, str) and message_fits(event_type, message):
            text = message
        else:
            return {"status": "rejected", "code": "EVENT_TYPE_INVALID"}
        sender, receiver = config["ownerPhone"], config["ownerPhone"]
    else:
        if (event_type not in CUSTOMER_EVENTS + CUSTOMER_EVENTS_V4 or not isinstance(recipient, str) or not re.fullmatch(r"010\d{8}", recipient)
                or not isinstance(message, str) or not message_fits(event_type, message)):
            return {"status": "rejected", "code": "CUSTOMER_MESSAGE_INVALID"}
        sender, receiver, text = config["customerSender"], recipient, message
    # 90바이트 안이면 늘 SMS(v1~v3 요청 모양 그대로). 넘는 것은 LMS_EVENTS 만 여기까지 온다
    msg_type = "SMS" if sms_bytes(text) <= MAX_SMS_BYTES else "LMS"
    fields = {
        "key": config["aligoKey"], "user_id": config["aligoUser"],
        "sender": sender, "receiver": receiver,
        "msg": text, "msg_type": msg_type, "testmode_yn": "Y" if config["mode"] == "test" else "N",
    }
    if msg_type == "LMS":
        fields["title"] = LMS_TITLE
    body = urllib.parse.urlencode(fields).encode()
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
            or success != 1 or errors != 0 or receipt.get("msg_type") != msg_type):
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
            if not isinstance(data, dict) or type(data.get("version")) is not int or data["version"] not in (1, 2, 3, 4):
                raise ValueError()
            if data["version"] == 3:
                return self.handle_customer(data, body)
            if data["version"] == 4:
                return self.handle_v4(data, body)
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
        base = {"eventId": data["eventId"], "mode": data["mode"]}
        if data["version"] == 2:
            base["eventType"] = event_type
        return self.attempt("owner", data, body, base, None, lambda: self.sender(self.config, event_type))

    def attempt(self, kind, data, body, base, recipient, send):
        """한 eventId 는 한 번만 보낸다 — 보내기 전에 '확인 불가'로 먼저 적어 두고(되돌리지 않는다) 한도를 센다."""
        event_id, digest, now = data["eventId"], hashlib.sha256(body).hexdigest(), int(self.clock())
        recipient_hash = None if recipient is None else hmac.new(self.config["secret"].encode(), ("customer:" + recipient).encode(), hashlib.sha256).hexdigest()
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
                if kind == "owner":
                    used = db.execute("SELECT count(*) FROM attempts WHERE day=? AND kind='owner'", (day,)).fetchone()[0]
                    if used >= self.config["dailyLimit"]:
                        db.commit()
                        return 429, {**base, "status": "blocked", "code": "DAILY_LIMIT_REACHED"}
                else:
                    used = db.execute("SELECT count(*) FROM attempts WHERE day=? AND kind='customer'", (day,)).fetchone()[0]
                    if used >= self.config["customerDailyLimit"]:
                        db.commit()
                        return 429, {**base, "status": "blocked", "code": "CUSTOMER_DAILY_LIMIT_REACHED"}
                    mine = db.execute("SELECT count(*) FROM attempts WHERE day=? AND kind='customer' AND recipient_hash=?", (day, recipient_hash)).fetchone()[0]
                    if mine >= self.config["perRecipientDailyLimit"]:
                        db.commit()
                        return 429, {**base, "status": "blocked", "code": "RECIPIENT_DAILY_LIMIT_REACHED"}
                db.execute("INSERT INTO attempts (event_id,body_hash,mode,day,status,code,receipt_id,created_at,updated_at,kind,recipient_hash) VALUES (?,?,?,?,?,?,NULL,?,?,?,?)",
                           (event_id, digest, data["mode"], day, "uncertain", "ATTEMPT_IN_PROGRESS_OR_INTERRUPTED", now, now, kind, recipient_hash))
                db.commit()
        except sqlite3.Error:
            return 503, {**base, "status": "blocked", "code": "DURABLE_LIMIT_UNAVAILABLE"}
        try:
            receipt = send()
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
                or not isinstance(data.get("eventId"), str) or not re.fullmatch(EVENT_ID, data["eventId"])
                or not isinstance(data.get("recipient"), str) or not re.fullmatch(r"010\d{8}", data["recipient"])):
            return 400, {"status": "blocked", "code": "INVALID_REQUEST"}
        message = customer_message(data["eventType"], data["params"])
        if message is None or sms_bytes(message) > MAX_SMS_BYTES:
            return 400, {"status": "blocked", "code": "INVALID_REQUEST"}
        event_type = data["eventType"]
        base = {"eventId": data["eventId"], "mode": data["mode"], "eventType": event_type}
        if data["mode"] != self.config["mode"]:
            return 409, {**base, "status": "blocked", "code": "PRIVATE_CONFIG_MISMATCH"}
        if not self.config["enabled"] or self.config.get("customerEnabled") is not True:
            return 503, {**base, "status": "blocked", "code": "CUSTOMER_SMS_DISABLED"}
        return self.attempt("customer", data, body, base, data["recipient"], lambda: self.sender(self.config, event_type, data["recipient"], message))

    def handle_v4(self, data, body):
        """v4 — 검사한 값만 고정 틀에 채운다. 운영자 알림은 v1 처럼 번호 대신 recipientCheck 로 설정 일치를 확인한다."""
        event_type = data.get("eventType")
        operator = event_type in OPERATOR_EVENTS
        if not operator and event_type not in CUSTOMER_EVENTS_V4:
            return 400, {"status": "blocked", "code": "INVALID_REQUEST"}
        expected = {"version", "eventId", "mode", "service", "eventType", "params", "recipientCheck" if operator else "recipient"}
        if (set(data) != expected or data.get("service") != "oneulstart"
                or not isinstance(data.get("eventId"), str) or not re.fullmatch(EVENT_ID, data["eventId"])
                or (not operator and (not isinstance(data.get("recipient"), str) or not re.fullmatch(r"010\d{8}", data["recipient"])))):
            return 400, {"status": "blocked", "code": "INVALID_REQUEST"}
        message = v4_message(event_type, data["params"])
        if message is None or not message_fits(event_type, message):
            return 400, {"status": "blocked", "code": "INVALID_REQUEST"}
        base = {"eventId": data["eventId"], "mode": data["mode"], "eventType": event_type}
        if operator:
            check = hmac.new(self.config["secret"].encode(), ("recipient:" + self.config["ownerPhone"]).encode(), hashlib.sha256).hexdigest()
            if data["mode"] != self.config["mode"] or not isinstance(data["recipientCheck"], str) or not hmac.compare_digest(data["recipientCheck"], check):
                return 409, {**base, "status": "blocked", "code": "PRIVATE_CONFIG_MISMATCH"}
            if not self.config["enabled"]:
                return 503, {**base, "status": "blocked", "code": "SMS_DISABLED"}
            if self.config.get("paymentEnabled") is not True:
                return 503, {**base, "status": "blocked", "code": "PAYMENT_SMS_DISABLED"}
            return self.attempt("owner", data, body, base, None, lambda: self.sender(self.config, event_type, None, message))
        if data["mode"] != self.config["mode"]:
            return 409, {**base, "status": "blocked", "code": "PRIVATE_CONFIG_MISMATCH"}
        if not self.config["enabled"] or self.config.get("customerEnabled") is not True:
            return 503, {**base, "status": "blocked", "code": "CUSTOMER_SMS_DISABLED"}
        return self.attempt("customer", data, body, base, data["recipient"], lambda: self.sender(self.config, event_type, data["recipient"], message))


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
