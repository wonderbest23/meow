"""In-place upgrade of an installed relay to v5 — 손님·사장님 알림을 알리고 카카오 알림톡으로(실패하면 알리고가 문자로 대체).
Run as root from the uploaded artifact directory (relay.py next to this file). v4 를 거치지 않았어도 된다(이 스크립트가 relay.py 를 통째로 바꾼다).

- 알리고 관리자에서 카카오 채널 발신 프로필 키(senderkey)와, 승인된 템플릿 코드(tpl_code)를 물어본다.
  템플릿 코드는 승인된 것만 넣고 나머지는 빈칸으로 두면 그 알림은 지금처럼 문자로 간다. 나중에 다시 실행해 채워도 된다.
- 바꾸는 것: /opt/oneulstart-owner-sms/relay.py(백업 후)와 config.json 의 "alimtalk" 한 칸. 실패하면 둘 다 되돌리고 재시작.
"""
import json
import os
import pathlib
import re
import shutil
import subprocess
import tempfile
import time
from relay import load_config

BASE = pathlib.Path(__file__).resolve().parent
TARGET = pathlib.Path("/opt/oneulstart-owner-sms/relay.py")
CONFIG = pathlib.Path("/etc/oneulstart-owner-sms/config.json")
SERVICE = "oneulstart-owner-sms"


def run(*args):
    if subprocess.run(args, capture_output=True, text=True).returncode:
        raise RuntimeError("COMMAND_FAILED:" + " ".join(args[:2]))


def ask(prompt, pattern, default=None):
    value = input(prompt).strip() or (default or "")
    if not re.fullmatch(pattern, value):
        raise RuntimeError("INVALID_INPUT")
    return value


EVENTS = [
    ("payment-receipt", "결제 완료(결제한 분께)"),
    ("homepage-lead-contact", "새 문의 — 이름·연락처(사장님께)"),
    ("homepage-lead", "새 문의 — 연락처 없이(사장님께)"),
    ("lead-received", "문의 접수 확인(문의한 손님께)"),
    ("domain-connect-started", "도메인 연결 시작(사장님께)"),
    ("tax-deadline", "세금 신고 마감(사장님께)"),
    ("weekly-report", "주간 리포트(사장님께)"),
]


def main():
    if os.geteuid() != 0:
        raise RuntimeError("ROOT_REQUIRED")
    if not TARGET.exists() or not CONFIG.exists():
        raise RuntimeError("EXISTING_INSTALLATION_REQUIRED")
    stamp = str(int(time.time()))
    old_code, old_config = TARGET.read_bytes(), CONFIG.read_bytes()
    stat = CONFIG.stat()
    config = json.loads(old_config)
    if "customerSender" not in config:
        raise RuntimeError("RUN_UPGRADE_CUSTOMER_FIRST")
    current = config.get("alimtalk") or {}
    print("알리고 관리자 → 카카오톡 → 발신프로필에서 senderkey, 템플릿 관리에서 승인된 템플릿 코드를 확인해 주세요.")
    sender_key = ask("발신 프로필 키(senderkey) [%s]: " % ("지금 값 유지" if current.get("senderKey") else "필수"), r"[A-Za-z0-9]{20,64}", current.get("senderKey"))
    templates = {}
    for event, label in EVENTS:
        old = (current.get("templates") or {}).get(event, "")
        code = input("%s 템플릿 코드 [%s]: " % (label, old or "비우면 문자")).strip() or old
        if code:
            if not re.fullmatch(r"[A-Za-z0-9_-]{2,40}", code):
                raise RuntimeError("INVALID_INPUT")
            templates[event] = code
    config["alimtalk"] = {"senderKey": sender_key, "templates": templates}
    with tempfile.TemporaryDirectory() as folder:
        check = pathlib.Path(folder) / "config.json"
        check.write_text(json.dumps(config)); check.chmod(0o600)
        load_config(check)  # the new relay must accept it before anything is replaced
    shutil.copyfile(TARGET, TARGET.with_name("relay.py.before-v5-" + stamp))
    shutil.copyfile(CONFIG, CONFIG.with_name("config.before-v5-" + stamp + ".json"))
    os.chmod(CONFIG.with_name("config.before-v5-" + stamp + ".json"), 0o600)
    try:
        shutil.copyfile(BASE / "relay.py", TARGET); TARGET.chmod(0o644)
        CONFIG.write_text(json.dumps(config)); CONFIG.chmod(0o600); os.chown(CONFIG, stat.st_uid, stat.st_gid)
        run("systemctl", "restart", SERVICE)
        time.sleep(2)
        run("systemctl", "is-active", "--quiet", SERVICE)
    except Exception:
        TARGET.write_bytes(old_code)
        CONFIG.write_bytes(old_config); CONFIG.chmod(0o600); os.chown(CONFIG, stat.st_uid, stat.st_gid)
        subprocess.run(["systemctl", "restart", SERVICE], capture_output=True)
        raise
    print(json.dumps({"upgraded": "v5", "alimtalkTemplates": sorted(templates), "backupSuffix": stamp}, ensure_ascii=False))


if __name__ == "__main__":
    main()
