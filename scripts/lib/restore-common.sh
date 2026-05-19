# shellcheck shell=bash
# Общие функции для scripts/restore_*.sh (source, не запускать напрямую).

restore_common_repo_root() {
  local here
  here="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  printf '%s' "$here"
}

restore_load_dotenv() {
  local env_file="${1:?}"
  [[ -f "$env_file" ]] || return 0
  command -v python3 >/dev/null 2>&1 || {
    echo "Нужен python3 для чтения .env." >&2
    return 0
  }
  # shellcheck disable=SC1090
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

restore_master_address() {
  if [[ -n "${MASTER_IP:-}" ]]; then
    MASTER_IP="$MASTER_IP" python3 <<'PY'
import json, os, sys

raw = os.environ["MASTER_IP"].strip()
try:
    data = json.loads(raw)
except json.JSONDecodeError as e:
    sys.exit(f"MASTER_IP: invalid JSON: {e}")
if not isinstance(data, dict):
    sys.exit("MASTER_IP must be a JSON object")
addr = str(data.get("address", "")).strip()
if not addr:
    sys.exit("MASTER_IP.address is empty")
print(addr)
PY
    return 0
  fi

  local repo_root inv_path
  repo_root="$(restore_common_repo_root)"
  inv_path="$repo_root/ansible/inventory.ini"
  if [[ ! -f "$inv_path" ]]; then
    echo "Задайте MASTER_IP в .env или соберите ansible/inventory.ini (ci-write-inventory.yml)." >&2
    return 1
  fi
  REPO_ROOT="$repo_root" python3 <<'PY'
import json, os, subprocess, sys

root = os.environ["REPO_ROOT"]
inv = os.path.join(root, "ansible", "inventory.ini")
p = subprocess.run(
    ["ansible-inventory", "-i", inv, "--list"],
    cwd=os.path.join(root, "ansible"),
    capture_output=True,
    text=True,
)
if p.returncode != 0:
    sys.exit(p.stderr or p.stdout or "ansible-inventory failed")
d = json.loads(p.stdout)
try:
    print(d["_meta"]["hostvars"]["master_host"]["ansible_host"])
except KeyError:
    sys.exit("inventory.ini: no master_host ansible_host")
PY
}

restore_ssh_key() {
  : "${SSH_PRIVATE_KEY:=$HOME/.ssh/id_ed25519}"
  if [[ ! -f "$SSH_PRIVATE_KEY" ]]; then
    echo "Нет файла SSH-ключа: $SSH_PRIVATE_KEY (задайте SSH_PRIVATE_KEY=...)." >&2
    return 1
  fi
  chmod 600 "$SSH_PRIVATE_KEY" 2>/dev/null || true
  printf '%s' "$SSH_PRIVATE_KEY"
}

restore_ssh_opts() {
  printf '%s' "-i $(restore_ssh_key) -o BatchMode=yes -o StrictHostKeyChecking=${STRICT_HOST_KEY_CHECKING:-accept-new}"
}

restore_require_file() {
  local path="$1"
  local label="${2:-file}"
  if [[ ! -f "$path" ]]; then
    echo "Не найден ${label}: $path" >&2
    return 1
  fi
  if [[ ! -s "$path" ]]; then
    echo "Пустой ${label}: $path" >&2
    return 1
  fi
}

restore_detect_pg_format() {
  local path="$1"
  local ext="${path##*.}"
  ext="${ext,,}"
  case "$ext" in
    sql) printf 'sql' ;;
    dump) printf 'custom' ;;
    backup) printf 'custom' ;;
    *)
      if head -c 5 "$path" | grep -q '^PGDMP'; then
        printf 'custom'
      else
        printf 'sql'
      fi
      ;;
  esac
}
