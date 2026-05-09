#!/usr/bin/env python3
"""Log into local 3x-ui, ensure an inbound exists (by pinned id, remark, or POST body). Print numeric inbound id to stdout."""
from __future__ import annotations

import argparse
from typing import Optional
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from http.cookiejar import CookieJar

CSRF_HEADER = "X-CSRF-Token"
CSRF_META_RE = re.compile(
    r'<meta\s+name="csrf-token"\s+content="([^"]+)"',
    re.IGNORECASE,
)


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


def login_page_url(og: str, raw_base: str) -> str:
    """Same idea as Nest ThreeXUiVpnProvider: GET panelOrigin + webBasePath (with trailing slash)."""
    p = raw_base.strip()
    if not p.startswith("/"):
        p = "/" + p
    if not p.endswith("/"):
        p = p + "/"
    return og + p


def try_read_html(op: urllib.request.OpenerDirector, url: str) -> Optional[str]:
    req = urllib.request.Request(
        url,
        headers={"Accept": "text/html,application/xhtml+xml,*/*"},
        method="GET",
    )
    try:
        with op.open(req, timeout=60) as resp:
            return resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        print(f"login-html: HTTP {e.code} url={url!r}", file=sys.stderr)
        return None
    except urllib.error.URLError as e:
        print(f"login-html: URL error {e.reason!r} url={url!r}", file=sys.stderr)
        return None


def try_csrf_json_url(op: urllib.request.OpenerDirector, url: str) -> Optional[str]:
    req = urllib.request.Request(
        url,
        headers={"Accept": "application/json"},
        method="GET",
    )
    try:
        with op.open(req, timeout=60) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
        data = json.loads(raw) if raw.strip() else {}
    except urllib.error.HTTPError:
        return None
    except (urllib.error.URLError, json.JSONDecodeError):
        return None
    if not data.get("success"):
        return None
    obj = data.get("obj")
    if isinstance(obj, str) and obj:
        return obj
    return None


def obtain_csrf(op: urllib.request.OpenerDirector, og: str, raw_base_path: str) -> str:
    """3x-ui SPA: meta on login page; JSON /csrf-token may 404 depending on base path / version."""
    lp = login_page_url(og, raw_base_path)
    html = try_read_html(op, lp)
    if html:
        m = CSRF_META_RE.search(html)
        if m and m.group(1):
            print(f"csrf: from login page meta tags {lp!r}", file=sys.stderr)
            return m.group(1)

    tried: list[str] = [lp]
    base_nt = norm_base(raw_base_path)
    json_candidates: list[str] = []
    if base_nt:
        json_candidates.append(f"{og}{base_nt}/csrf-token")
    json_candidates.append(f"{og}/csrf-token")
    for url in json_candidates:
        tried.append(url)
        tok = try_csrf_json_url(op, url)
        if tok:
            print(f"csrf: from JSON endpoint {url!r}", file=sys.stderr)
            return tok

    print(
        "csrf: failed — tried login HTML + JSON fallbacks: "
        + ", ".join(repr(t) for t in tried),
        file=sys.stderr,
    )
    sys.exit(1)


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
    csrf = obtain_csrf(op, og, args.base_path)
    post_login(op, base_url, args.username, args.password, csrf)

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
