"""In-place upgrade of an installed relay to v4 (payment / lead-contact / visitor receipt / domain / tax alerts).
Run as root from the uploaded artifact directory (relay.py next to this file).

- Requires the v3 customer keys already in config.json (run upgrade_customer.py first if not).
- Changes only /opt/oneulstart-owner-sms/relay.py (backed up first) and two keys in config.json:
  dailyLimit (operator alerts per UTC day, now up to 200) and paymentEnabled (operator payment SMS, default off).
- v4 customer events use the existing customerEnabled / customerDailyLimit / perRecipientDailyLimit.
- Any failure restores the previous relay.py and config.json and restarts the service.
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
    print("현재 relay 설정: mode=%s enabled=%s dailyLimit=%s customerEnabled=%s" % (
        config.get("mode"), config.get("enabled"), config.get("dailyLimit"), config.get("customerEnabled")))
    # 결제마다 운영자 문자 1통 — 문의·사업안 알림과 같은 하루 한도를 쓴다
    daily = int(ask("운영자 문자 하루 한도(문의·사업안·결제 합계, 1~200) [100]: ", r"[1-9]\d{0,2}", "100"))
    if daily > 200:
        raise RuntimeError("INVALID_INPUT")
    payment = input("결제 완료 운영자 문자를 켤까요? (y/N): ").strip().lower() == "y"
    config.update({"dailyLimit": daily, "paymentEnabled": payment})
    with tempfile.TemporaryDirectory() as folder:
        check = pathlib.Path(folder) / "config.json"
        check.write_text(json.dumps(config)); check.chmod(0o600)
        load_config(check)  # the new relay must accept it before anything is replaced
    shutil.copyfile(TARGET, TARGET.with_name("relay.py.before-v4-" + stamp))
    shutil.copyfile(CONFIG, CONFIG.with_name("config.before-v4-" + stamp + ".json"))
    os.chmod(CONFIG.with_name("config.before-v4-" + stamp + ".json"), 0o600)
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
    print(json.dumps({"upgraded": "v4", "dailyLimit": daily, "paymentEnabled": payment, "customerEnabled": config.get("customerEnabled"), "backupSuffix": stamp}))


if __name__ == "__main__":
    main()
