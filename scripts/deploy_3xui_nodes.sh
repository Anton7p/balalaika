#!/usr/bin/env bash
# Локальный деплой нод 3x-ui + регистрация на master (как deploy-3xui.yml target=nodes).
#
#   bash scripts/deploy_3xui_nodes.sh
#
# Нужны: MASTER_IP, NODE_IPS, SSH_PRIVATE_KEY, DOMAIN_NAME, VPN_ADMIN_USERNAME, VPN_ADMIN_PASSWORD
# (как секреты в CI; локально — .env или export).
# Из корня репозитория в WSL/Linux. При CRLF: sed -i 's/\r$//' scripts/deploy_3xui_nodes.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

load_dotenv_safe() {
  local env_file="$REPO_ROOT/.env"
  [[ -f "$env_file" ]] || return 0
  command -v python3 >/dev/null 2>&1 || {
    echo "Нужен python3 для чтения .env." >&2
    return 0
  }
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

load_dotenv_safe

: "${SSH_PRIVATE_KEY:=$HOME/.ssh/id_ed25519}"

for v in MASTER_IP NODE_IPS DOMAIN_NAME VPN_ADMIN_USERNAME VPN_ADMIN_PASSWORD; do
  if [[ -z "${!v:-}" ]]; then
    echo "Не задана переменная $v (export или .env)." >&2
    exit 1
  fi
done

if [[ ! -f "$SSH_PRIVATE_KEY" ]]; then
  echo "Нет файла ключа: $SSH_PRIVATE_KEY (задайте SSH_PRIVATE_KEY=...)." >&2
  exit 1
fi

chmod 600 "$SSH_PRIVATE_KEY" 2>/dev/null || true

export NODE_IPS

echo "==> ansible-galaxy collection install (posix, community.general)"
ansible-galaxy collection install ansible.posix community.general

echo "==> ci-write-inventory.yml → ansible/inventory.ini"
(
  cd "$REPO_ROOT/ansible"
  ansible-playbook -i localhost, ci/ci-write-inventory.yml
)

export ANSIBLE_HOST_KEY_CHECKING="${ANSIBLE_HOST_KEY_CHECKING:-False}"

echo "==> ping nodes"
(
  cd "$REPO_ROOT/ansible"
  ansible nodes -i inventory.ini -m ping --private-key "$SSH_PRIVATE_KEY"
)

echo "==> 3xui/deploy-nodes.yml --syntax-check"
(
  cd "$REPO_ROOT/ansible"
  ansible-playbook -i inventory.ini 3xui/deploy-nodes.yml --syntax-check --private-key "$SSH_PRIVATE_KEY"
)

echo "==> 3xui/deploy-nodes.yml"
(
  cd "$REPO_ROOT/ansible"
  ansible-playbook -i inventory.ini 3xui/deploy-nodes.yml --private-key "$SSH_PRIVATE_KEY"
)

echo "Готово (ноды + регистрация на master)."
