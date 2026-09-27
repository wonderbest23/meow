"""Reviewed, single-purpose installer. Run from the uploaded artifact directory."""
import getpass
import hashlib
import json
import os
import pathlib
import pwd
import re
import shutil
import socket
import subprocess
import time
from relay import load_config

EXPECTED_NGINX_SHA = "fe17385729f5f54624db297fc01a3e50eb5ac1f7af0722d3edb9c20d7d6fb432"
BASE = pathlib.Path(__file__).resolve().parent
TARGET = pathlib.Path("/opt/oneulstart-owner-sms")
CONFIG_DIR = pathlib.Path("/etc/oneulstart-owner-sms")
DATA = pathlib.Path("/var/lib/oneulstart-owner-sms")
NGINX = pathlib.Path("/etc/nginx/sites-enabled/api.artandbridge.com.conf").resolve()
SNIPPET = pathlib.Path("/etc/nginx/snippets/oneulstart-owner-sms.conf")
UNIT = pathlib.Path("/etc/systemd/system/oneulstart-owner-sms.service")
INCLUDE = "include /etc/nginx/snippets/oneulstart-owner-sms.conf;"


def run(*args):
    process = subprocess.run(args, capture_output=True, text=True)
    if process.returncode:
        raise RuntimeError("COMMAND_FAILED:" + args[0])


def main():
    if os.geteuid() != 0:
        raise RuntimeError("ROOT_REQUIRED")
    os.umask(0o077)
    original = NGINX.read_bytes()
    if hashlib.sha256(original).hexdigest() != EXPECTED_NGINX_SHA:
        raise RuntimeError("NGINX_CHANGED_REVIEW_REQUIRED")
    if any(path.exists() for path in [TARGET, CONFIG_DIR, DATA, SNIPPET, UNIT]):
        raise RuntimeError("EXISTING_INSTALLATION_REVIEW_REQUIRED")
    with socket.socket() as check:
        check.bind(("127.0.0.1", 18189))
    run("/usr/sbin/nginx", "-t")
    # Hidden stdin only; credentials never occur in shell history or process argv.
    raw = getpass.getpass("Oneulstart private configuration JSON (hidden): ")
    config = json.loads(raw)
    if config.get("mode") != "test" or config.get("enabled") is not False:
        raise RuntimeError("INSTALL_DISABLED_TEST_MODE_REQUIRED")
    private_temp = BASE / "private-config.json"
    private_temp.write_text(json.dumps(config)); private_temp.chmod(0o600)
    load_config(private_temp)
    try:
        pwd.getpwnam("oneul-sms")
        raise RuntimeError("EXISTING_SERVICE_USER_REVIEW_REQUIRED")
    except KeyError:
        pass
    run("useradd", "--system", "--no-create-home", "--home-dir", str(DATA), "--shell", "/usr/sbin/nologin", "oneul-sms")
    user = pwd.getpwnam("oneul-sms")
    TARGET.mkdir(mode=0o755); TARGET.chmod(0o755)
    CONFIG_DIR.mkdir(mode=0o700); os.chown(CONFIG_DIR, user.pw_uid, user.pw_gid)
    DATA.mkdir(mode=0o700); os.chown(DATA, user.pw_uid, user.pw_gid)
    shutil.copyfile(BASE / "relay.py", TARGET / "relay.py"); (TARGET / "relay.py").chmod(0o644)
    shutil.move(private_temp, CONFIG_DIR / "config.json")
    os.chown(CONFIG_DIR / "config.json", user.pw_uid, user.pw_gid)
    backup = CONFIG_DIR / "nginx-before.conf"
    backup.write_bytes(original); backup.chmod(0o600)
    record = {"createdAt": int(time.time()), "sourceSha256": hashlib.sha256((BASE / "relay.py").read_bytes()).hexdigest(),
              "nginxPath": str(NGINX), "nginxBeforeSha256": EXPECTED_NGINX_SHA, "state": "prepared",
              "rollback": "Stop only oneulstart-owner-sms, restore nginx-before.conf iff the current nginx hash matches the recorded after hash, nginx -t, reload nginx; retain private config and attempts database."}
    (CONFIG_DIR / "recovery.json").write_text(json.dumps(record, indent=2))
    shutil.copyfile(BASE / "oneulstart-owner-sms.service", UNIT); UNIT.chmod(0o644)
    shutil.copyfile(BASE / "nginx-location.conf", SNIPPET); SNIPPET.chmod(0o644)
    text, count = re.subn(r"(?m)^(\s*)location / \{", lambda match: match[1] + INCLUDE + "\n" + match.group(0), original.decode())
    if count != 1:
        raise RuntimeError("AMBIGUOUS_NGINX_LOCATION")
    record["nginxAfterSha256"] = hashlib.sha256(text.encode()).hexdigest()
    (CONFIG_DIR / "recovery.json").write_text(json.dumps(record, indent=2))
    try:
        NGINX.write_text(text)
        run("/usr/sbin/nginx", "-t")
        run("systemctl", "daemon-reload")
        run("systemctl", "enable", "--now", "oneulstart-owner-sms")
        run("systemctl", "is-active", "--quiet", "oneulstart-owner-sms")
        run("systemctl", "reload", "nginx")
    except Exception:
        subprocess.run(["systemctl", "stop", "oneulstart-owner-sms"], capture_output=True)
        NGINX.write_bytes(original)
        run("/usr/sbin/nginx", "-t")
        run("systemctl", "reload", "nginx")
        record["state"] = "rolled_back"
        (CONFIG_DIR / "recovery.json").write_text(json.dumps(record, indent=2))
        raise
    record["state"] = "installed_disabled_test_mode"
    (CONFIG_DIR / "recovery.json").write_text(json.dumps(record, indent=2))
    print(json.dumps({"installed": True, "enabled": False, "mode": "test", "dailyLimit": config["dailyLimit"], "existingApiRoutesPreserved": True}))


if __name__ == "__main__":
    main()
