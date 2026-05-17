#!/usr/bin/env bash
# Логи vpn-watchdog на master (с локальной машины / WSL).
#
#   bash scripts/watchdog_logs.sh        # последние 100 строк
#   bash scripts/watchdog_logs.sh -f     # follow
#   bash scripts/watchdog_logs.sh 200    # tail 200
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

load_dotenv_safe() {
  local env_file="$REPO_ROOT/.env"
  [[ -f "$env_file" ]] || return 0
  command -v python3 >/dev/null 2>&1 || return 0
  eval "$(
    ENV_FILE="$env_file" python3 <<'PY'
import os, pathlib, shlex
p = pathlib.Path(os.environ["ENV_FILE"])
for raw in p.read_text(encoding="utf-8", errors="replace").splitlines():
    s = raw.strip()
    if not s or s.startswith("#") or "=" not in s:
        continue
    k, v = s.split("=", 1)
    k, v = k.strip(), v.strip()
    if not k:
        continue
    if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
        v = v[1:-1]
    print(f"export {shlex.quote(k)}={shlex.quote(v)}")
PY
  )"
}

master_host_from_inventory() {
  REPO_ROOT="$REPO_ROOT" python3 <<'PY'
import json, os, subprocess
root = os.environ["REPO_ROOT"]
inv_path = os.path.join(root, "ansible", "inventory.ini")
p = subprocess.run(
    ["ansible-inventory", "-i", inv_path, "--list"],
    cwd=os.path.join(root, "ansible"),
    capture_output=True,
    text=True,
)
if p.returncode != 0:
    raise SystemExit(p.stderr or p.stdout)
d = json.loads(p.stdout)
print(d["_meta"]["hostvars"]["master_host"]["ansible_host"])
PY
}

load_dotenv_safe
: "${SSH_PRIVATE_KEY:=$HOME/.ssh/id_ed25519}"

if [[ -z "${MASTER_IP:-}" ]]; then
  echo "Не задан MASTER_IP." >&2
  exit 1
fi
if [[ ! -f "$SSH_PRIVATE_KEY" ]]; then
  echo "Нет ключа: $SSH_PRIVATE_KEY" >&2
  exit 1
fi

[[ -n "${NODE_IPS:-}" ]] && export NODE_IPS
(
  cd "$REPO_ROOT/ansible"
  ansible-playbook -i localhost, ci/ci-write-inventory.yml
)

MASTER_ADDR="$(master_host_from_inventory)"
FOLLOW=0
TAIL=100
for a in "$@"; do
  case "$a" in
    -f|--follow) FOLLOW=1 ;;
    [0-9]*) TAIL="$a" ;;
  esac
done

SSH_OPTS=(-i "$SSH_PRIVATE_KEY" -o BatchMode=yes -o "StrictHostKeyChecking=${STRICT_HOST_KEY_CHECKING:-no}")

if [[ "$FOLLOW" == 1 ]]; then
  echo "==> follow vpn-watchdog on root@${MASTER_ADDR} (Ctrl+C)"
  ssh "${SSH_OPTS[@]}" "root@${MASTER_ADDR}" \
    "cd /opt/infrastructure/app && docker compose logs -f vpn-watchdog --no-log-prefix"
else
  echo "==> root@${MASTER_ADDR}"
  cat "$REPO_ROOT/scripts/watchdog-logs-remote.sh" | ssh "${SSH_OPTS[@]}" "root@${MASTER_ADDR}" bash -s "$TAIL"
fi
