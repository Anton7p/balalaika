#!/usr/bin/env python3
"""Write ansible/inventory.ini for CI: single master host from SERVER_IP (optional JSON with password)."""

from __future__ import annotations

import json
import os
import pathlib
import re
import sys


def main() -> None:
    raw = os.environ.get("SERVER_IP", "").strip()
    master_password = ""
    if raw.startswith("{"):
        try:
            obj = json.loads(raw)
            if isinstance(obj, dict):
                raw = str(obj.get("address", "")).strip()
                master_password = str(obj.get("password", "")).strip()
        except json.JSONDecodeError:
            pass

    server_ip = re.sub(r"^https?://", "", raw).strip().strip("/").strip("\"'")
    if ":" in server_ip:
        server_ip = server_ip.split(":", 1)[0].strip()

    if not re.fullmatch(r"[A-Za-z0-9._-]+", server_ip):
        ip_match = re.search(r"(\d{1,3}(?:\.\d{1,3}){3})", raw)
        if ip_match:
            server_ip = ip_match.group(1)
        else:
            host_match = re.search(r"([A-Za-z0-9._-]+)", raw)
            server_ip = host_match.group(1) if host_match else ""

    if not re.fullmatch(r"[A-Za-z0-9._-]+", server_ip):
        print("SERVER_IP is not parseable", file=sys.stderr)
        sys.exit(1)

    master_entry = f"master_host ansible_host={server_ip} ansible_user=root"
    if master_password:
        master_entry += f" ansible_password='{master_password}'"

    lines = [
        "[master]",
        master_entry,
        "",
        "[all:vars]",
        "ansible_connection=ssh",
        "ansible_become=true",
    ]
    out = pathlib.Path(os.environ.get("OUTPUT_PATH", "ansible/inventory.ini"))
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
