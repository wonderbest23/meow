"""One approved live check at most; no retries. Keep durable attempt records."""
import argparse
import hashlib
import hmac
import json
import os
import pathlib
import subprocess
import socket
import sys
import time
import urllib.error
import urllib.request

sys.path.insert(0, "/opt/oneulstart-owner-sms")
from relay import PATH, NoRedirect, signature

CONFIG = pathlib.Path("/etc/oneulstart-owner-sms/config.json")
DATA = pathlib.Path("/var/lib/oneulstart-owner-sms")
IDS = {"test": "3899f505-28c2-42ba-b165-16b8d5a05c01", "live": "3899f505-28c2-42ba-b165-16b8d5a05c02"}


def save_config(config):
    temp = CONFIG.with_suffix(".new")
    temp.write_text(json.dumps(config)); temp.chmod(0o600)
    original = CONFIG.stat(); os.chown(temp, original.st_uid, original.st_gid)
    temp.replace(CONFIG)
    subprocess.run(["systemctl", "restart", "oneulstart-owner-sms"], check=True)
    subprocess.run(["systemctl", "is-active", "--quiet", "oneulstart-owner-sms"], check=True)
    deadline = time.monotonic() + 5
    while True:
        try:
            with socket.create_connection(("127.0.0.1", 18189), timeout=0.2):
                return
        except OSError:
            if time.monotonic() >= deadline:
                raise RuntimeError("RELAY_LISTEN_DEADLINE")
            time.sleep(0.1)


def main():
    parser = argparse.ArgumentParser(); parser.add_argument("--mode", choices=["test", "live"], required=True)
    parser.add_argument("--test-revision", choices=["original", "bic-scoped", "listener-ready", "receipt-normalized"], default="original")
    args = parser.parse_args()
    os.umask(0o077)
    test_suffix = "-" + args.test_revision if args.test_revision != "original" else ""
    # A new non-billing check follows the approved BIC change. The live gate is unchanged.
    record = DATA / ("approved-check-20260927-" + args.mode + (test_suffix if args.mode == "test" else "") + ".json")
    config = json.loads(CONFIG.read_text())
    if config["enabled"]:
        raise RuntimeError("DISABLED_BASELINE_REQUIRED")
    if args.mode == "live":
        prior = json.loads((DATA / ("approved-check-20260927-test" + test_suffix + ".json")).read_text())
        if prior.get("result", {}).get("status") != "test_accepted":
            raise RuntimeError("NONBILLING_TEST_MUST_PASS_FIRST")
    event_id = IDS[args.mode]
    if args.mode == "test" and test_suffix:
        event_id = "3899f505-28c2-42ba-b165-16b8d5a05c03"
    if args.mode == "test" and args.test_revision == "listener-ready":
        event_id = "3899f505-28c2-42ba-b165-16b8d5a05c04"
    if args.mode == "test" and args.test_revision == "receipt-normalized":
        event_id = "3899f505-28c2-42ba-b165-16b8d5a05c06"
    state = {"eventId": event_id, "mode": args.mode, "startedAt": int(time.time()), "state": "reserved_no_retry"}
    with record.open("x") as output:
        json.dump(state, output)
    try:
        active = {**config, "enabled": True, "mode": args.mode}
        save_config(active)
        recipient = hmac.new(config["secret"].encode(), ("recipient:" + config["ownerPhone"]).encode(), hashlib.sha256).hexdigest()
        body = json.dumps({"version": 1, "eventId": event_id, "mode": args.mode, "recipientCheck": recipient}, separators=(",", ":")).encode()
        stamp = str(int(time.time()))
        request = urllib.request.Request("https://api.artandbridge.com" + PATH, method="POST", data=body,
          headers={"Content-Type": "application/json", "x-oneul-time": stamp, "x-oneul-signature": signature(config["secret"], stamp, body)})
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
        began = time.monotonic()
        try:
            with opener.open(request, timeout=10) as response:
                state["httpStatus"] = response.status
                state["result"] = json.loads(response.read(4097))
        except urllib.error.HTTPError as error:
            state["httpStatus"] = error.code
            state["result"] = json.loads(error.read(4097)); error.close()
        state["elapsedMs"] = round((time.monotonic() - began) * 1000)
        state["state"] = "finished_no_retry"
    except Exception as error:
        state["state"] = "uncertain_no_retry"
        state["errorType"] = type(error).__name__
    finally:
        disabled = {**config, "enabled": False}
        try:
            save_config(disabled)
            state["disabledAfterCheck"] = True
        except Exception:
            subprocess.run(["systemctl", "stop", "oneulstart-owner-sms"], capture_output=True)
            state["disabledAfterCheck"] = False
            state["stopRequested"] = True
        record.write_text(json.dumps(state, indent=2))
    print(json.dumps(state))
    expected = "test_accepted" if args.mode == "test" else "accepted"
    if state.get("result", {}).get("status") != expected or not state.get("disabledAfterCheck"):
        sys.exit(1)


if __name__ == "__main__":
    main()
