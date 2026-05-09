#!/usr/bin/env python3
"""Log into local 3x-ui, ensure an inbound exists (by pinned id, remark, or POST body). Print numeric inbound id to stdout."""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from http.cookiejar import CookieJar

CSRF_HEADER = "X-CSRF-Token"


def fetch_json(
    op: urllib.request.OpenerDirector,
    req: urllib.request.Request,
    label: str,
    *,
    timeout: float = 60,
) -> tuple[int, dict]:
    """HTTP GET/POST and parse JSON; on failure print status + body to stderr and exit."""
    url = req.get_full_url()
    try:
        with op.open(req, timeout=timeout) as resp:
            status = resp.getcode()
            raw = resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        try:
            raw = e.read().decode("utf-8", errors="replace")
        except Exception:
            raw = ""
        print(
            f"{label}: HTTP {e.code} url={url!r} body[:8000]={raw[:8000]!r}",
            file=sys.stderr,
        )
        sys.exit(1)
    except urllib.error.URLError as e:
        print(f"{label}: URL error {e.reason!r} url={url!r}", file=sys.stderr)
        sys.exit(1)
    try:
        data = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError as exc:
        print(
            f"{label}: HTTP {status} JSON decode {exc}; body[:8000]={raw[:8000]!r}",
            file=sys.stderr,
        )
        sys.exit(1)
    return status, data


def norm_base(path: str) -> str:
    p = path.strip()
    if not p.startswith("/"):
        p = "/" + p
    p = p.rstrip("/")
    return p if p else ""


def origin(host: str, port: int) -> str:
    return f"http://{host}:{port}"


def opener_with_cookies() -> urllib.request.OpenerDirector:
    jar = CookieJar()
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def csrf_token(op: urllib.request.OpenerDirector, base_url: str) -> str:
    req = urllib.request.Request(
        f"{base_url}/csrf-token",
        headers={"Accept": "application/json"},
        method="GET",
    )
    _, data = fetch_json(op, req, "csrf-token", timeout=60)
    if not data.get("success"):
        print(f"csrf-token: unexpected response: {data}", file=sys.stderr)
        sys.exit(1)
    obj = data.get("obj")
    if not isinstance(obj, str) or not obj:
        print(f"csrf-token: missing token: {data}", file=sys.stderr)
        sys.exit(1)
    return obj


def post_login(
    op: urllib.request.OpenerDirector,
    base_url: str,
    username: str,
    password: str,
    csrf: str,
) -> None:
    body = urllib.parse.urlencode(
        {"username": username, "password": password}
    ).encode("utf-8")
    req = urllib.request.Request(
        f"{base_url}/login",
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
            CSRF_HEADER: csrf,
            "X-Requested-With": "XMLHttpRequest",
        },
    )
    _, data = fetch_json(op, req, "login", timeout=60)
    if not data.get("success"):
        print(f"login failed: {data}", file=sys.stderr)
        sys.exit(1)


def get_inbounds(op: urllib.request.OpenerDirector, api_root: str, csrf: str) -> list:
    req = urllib.request.Request(
        f"{api_root}/inbounds/list",
        method="GET",
        headers={
            "Accept": "application/json",
            CSRF_HEADER: csrf,
            "X-Requested-With": "XMLHttpRequest",
        },
    )
    _, data = fetch_json(op, req, "inbounds/list", timeout=60)
    if not data.get("success"):
        print(f"inbounds/list failed: {data}", file=sys.stderr)
        sys.exit(1)
    obj = data.get("obj")
    if obj is None:
        return []
    if not isinstance(obj, list):
        print(f"inbounds/list: obj not a list: {data!r}", file=sys.stderr)
        sys.exit(1)
    return obj


def add_inbound(
    op: urllib.request.OpenerDirector,
    api_root: str,
    csrf: str,
    payload: dict,
) -> int:
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{api_root}/inbounds/add",
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            CSRF_HEADER: csrf,
            "X-Requested-With": "XMLHttpRequest",
        },
    )
    _, data = fetch_json(op, req, "inbounds/add", timeout=120)
    if not data.get("success"):
        print(
            f"inbounds/add failed: {data!r} payload_keys={list(payload.keys())!r}",
            file=sys.stderr,
        )
        sys.exit(1)
    obj = data.get("obj")
    if not isinstance(obj, dict) or "id" not in obj:
        print(f"inbounds/add: missing id in obj: {data!r}", file=sys.stderr)
        sys.exit(1)
    return int(obj["id"])


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--panel-port", type=int, required=True)
    ap.add_argument("--base-path", default="/panel/")
    ap.add_argument("--username", required=True)
    ap.add_argument(
        "--password",
        default=os.environ.get("XUI_SCRIPT_PASSWORD", ""),
        help="Panel password (default: env XUI_SCRIPT_PASSWORD)",
    )
    ap.add_argument("--remark", required=True, help="Managed inbound remark (match existing)")
    ap.add_argument(
        "--pinned-id",
        type=int,
        default=0,
        help="If >0 and present on panel, use without creating",
    )
    ap.add_argument(
        "--body-file",
        required=True,
        help="JSON POST body for /inbounds/add when inbound must be created",
    )
    args = ap.parse_args()
    if not args.password:
        print(
            "missing password: pass --password or set XUI_SCRIPT_PASSWORD",
            file=sys.stderr,
        )
        sys.exit(1)

    base = norm_base(args.base_path)
    og = origin(args.host, args.panel_port)
    base_url = og + base
    api_root = f"{og}{base}/panel/api"
    print(
        f"three_x_ui_ensure_inbound: base_url={base_url!r} api_root={api_root!r}",
        file=sys.stderr,
    )

    with open(args.body_file, encoding="utf-8") as f:
        body_payload = json.load(f)

    op = opener_with_cookies()
    pre_csrf = csrf_token(op, base_url)
    post_login(op, base_url, args.username, args.password, pre_csrf)
    csrf = csrf_token(op, base_url)

    rows = get_inbounds(op, api_root, csrf)

    if args.pinned_id > 0:
        ids = {int(row.get("id", 0)) for row in rows}
        if args.pinned_id in ids:
            print(args.pinned_id, end="")
            return
        print(
            f"pinned inbound id {args.pinned_id} not found on panel",
            file=sys.stderr,
        )
        sys.exit(1)

    for row in rows:
        if str(row.get("remark", "")).strip() == args.remark.strip():
            print(int(row["id"]), end="")
            return

    new_id = add_inbound(op, api_root, csrf, body_payload)
    print(new_id, end="")


if __name__ == "__main__":
    main()
