#!/usr/bin/env bash
# Полный сброс: остановка контейнеров, удаление БД панели и томов Postgres/Redis на master, то же на нодах для 3x-ui.
#
#   bash scripts/teardown_infrastructure.sh
#
# Нужны MASTER_IP, SSH_PRIVATE_KEY; для нод — NODE_IPS (как в deploy_3xui_nodes.sh).
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

load_dotenv_safe

: "${SSH_PRIVATE_KEY:=$HOME/.ssh/id_ed25519}"

if [[ -z "${MASTER_IP:-}" ]]; then
  echo "Не задан MASTER_IP." >&2
  exit 1
fi

if [[ ! -f "$SSH_PRIVATE_KEY" ]]; then
  echo "Нет файла ключа: $SSH_PRIVATE_KEY" >&2
  exit 1
fi

chmod 600 "$SSH_PRIVATE_KEY" 2>/dev/null || true
[[ -n "${NODE_IPS:-}" ]] && export NODE_IPS

REMOTE_SCRIPT="${REPO_ROOT}/scripts/teardown-remote.sh"
if [[ ! -f "$REMOTE_SCRIPT" ]]; then
  echo "Нет $REMOTE_SCRIPT" >&2
  exit 1
fi

echo "==> ansible-galaxy collection install"
ansible-galaxy collection install ansible.posix community.general >/dev/null

echo "==> ci-write-inventory.yml"
(
  cd "$REPO_ROOT/ansible"
  ansible-playbook -i localhost, ci/ci-write-inventory.yml
)

export ANSIBLE_HOST_KEY_CHECKING="${ANSIBLE_HOST_KEY_CHECKING:-False}"
ANSIBLE_SCRIPT=(ansible -i "$REPO_ROOT/ansible/inventory.ini" -m script -a "$REMOTE_SCRIPT" --private-key "$SSH_PRIVATE_KEY")

if ANSIBLE_HOST_KEY_CHECKING="${ANSIBLE_HOST_KEY_CHECKING}" ansible nodes -i "$REPO_ROOT/ansible/inventory.ini" --list-hosts 2>/dev/null | grep -qE '^node'; then
  echo "==> teardown nodes"
  (
    cd "$REPO_ROOT/ansible"
    ansible nodes -i inventory.ini -m ping --private-key "$SSH_PRIVATE_KEY"
    ansible nodes -i inventory.ini -m script -a "$REMOTE_SCRIPT" --private-key "$SSH_PRIVATE_KEY"
  )
else
  echo "==> teardown nodes — пропуск (нет [nodes] в inventory)"
fi

echo "==> teardown master"
(
  cd "$REPO_ROOT/ansible"
  ansible master -i inventory.ini -m ping --private-key "$SSH_PRIVATE_KEY"
  ansible master -i inventory.ini -m script -a "$REMOTE_SCRIPT" --private-key "$SSH_PRIVATE_KEY"
)

echo "Готово (teardown)."
