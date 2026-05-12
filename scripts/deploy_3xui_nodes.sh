#!/usr/bin/env bash
# Локальный деплой только нод 3x-ui (аналог deploy-3xui.yml с target=nodes).
# Плейбук выполняется на localhost; список нод берётся из NODE_IPS.
#
#   bash scripts/deploy_3xui_nodes.sh
#
# Нужны в .env или в окружении: NODE_IPS — JSON-массив
#   [{"address":"10.0.0.2","password":"root-pass"}, ...]
# См. ansible/ci/ci-write-inventory.yml и docs/GITHUB_SECRETS.md.
# Из корня репозитория в WSL/Linux. При CRLF: sed -i 's/\r$//' scripts/deploy_3xui_nodes.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

load_dotenv_safe() {
  local env_file="$REPO_ROOT/.env"
  [[ -f "$env_file" ]] || return 0
  command -v python3 >/dev/null 2>&1 || {
    echo "Нужен python3 для чтения .env (JSON в NODE_IPS). Задайте NODE_IPS вручную." >&2
    return 0
  }
  eval "$(
    ENV_FILE="$env_file" python3 <<'PY'
import os, pathlib, shlex

p = pathlib.Path(os.environ["ENV_FILE"])
for raw in p.read_text(encoding="utf-8", errors="replace").splitlines():
    s = raw.strip()
    if not s or s.startswith("#"):
        continue
    if "=" not in s:
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

load_dotenv_safe

if [[ -z "${NODE_IPS:-}" ]]; then
  echo "Не задан NODE_IPS (JSON-массив объектов address/password) — .env или export." >&2
  exit 1
fi

export NODE_IPS

echo "==> 3xui/deploy-nodes.yml --syntax-check"
(
  cd "$REPO_ROOT/ansible"
  ansible-playbook -i localhost, 3xui/deploy-nodes.yml --syntax-check
)

echo "==> 3xui/deploy-nodes.yml"
(
  cd "$REPO_ROOT/ansible"
  ansible-playbook -i localhost, 3xui/deploy-nodes.yml
)

echo "Готово (ноды)."
