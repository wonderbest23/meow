"""In-place upgrade of an installed relay to v3 (homepage-owner alerts). Run as root from the uploaded artifact directory.

- Keeps the private config, attempts database, nginx and service unit untouched except for:
  /opt/oneulstart-owner-sms/relay.py (backed up first) and new customer* keys in config.json.
- Customer alerts start DISABLED unless you answer "y" to the last question.
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
    print("현재 relay 설정: mode=%s enabled=%s dailyLimit=%s" % (config.get("mode"), config.get("enabled"), config.get("dailyLimit")))
    sender = ask("사장님께 보일 발신번호(알리고에 등록된 번호, 숫자만): ", r"0\d{8,10}|1\d{7}")
    daily = int(ask("사장님 문자 하루 전체 한도 [300]: ", r"[1-9]\d{0,3}", "300"))
    per = int(ask("한 사장님 번호당 하루 한도 [20]: ", r"[1-9]\d?", "20"))
    enable = input("지금 사장님 문자를 켤까요? (y/N): ").strip().lower() == "y"
    config.update({"customerEnabled": enable, "customerSender": sender, "customerDailyLimit": daily, "perRecipientDailyLimit": per})
    with tempfile.TemporaryDirectory() as folder:
        check = pathlib.Path(folder) / "config.json"
        check.write_text(json.dumps(config)); check.chmod(0o600)
        load_config(check)  # the new relay must accept it before anything is replaced
    shutil.copyfile(TARGET, TARGET.with_name("relay.py.before-v3-" + stamp))
    shutil.copyfile(CONFIG, CONFIG.with_name("config.before-v3-" + stamp + ".json"))
    os.chmod(CONFIG.with_name("config.before-v3-" + stamp + ".json"), 0o600)
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
    print(json.dumps({"upgraded": True, "customerEnabled": enable, "customerDailyLimit": daily, "perRecipientDailyLimit": per, "backupSuffix": stamp}))


if __name__ == "__main__":
    main()
