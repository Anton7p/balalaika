#!/usr/bin/env bash
# Локальный деплой только панели 3x-ui на master (аналог deploy-3xui.yml с target=panel).
#
#   bash scripts/deploy_3xui_panel.sh
#
# Нужны в .env или в окружении: MASTER_IP (JSON), SSH_PRIVATE_KEY (путь к ключу).
# Опционально: NODE_IPS — попадёт в inventory.ini для группы [nodes] (сам плейбук панели на master их не трогает).
# Из корня репозитория в WSL/Linux. При CRLF: sed -i 's/\r$//' scripts/deploy_3xui_panel.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

ensure_gitignore_entries() {
  local gitignore="$REPO_ROOT/.gitignore"
  [[ -f "$gitignore" ]] || touch "$gitignore"
  local -a entries=(
    "ansible/inventory.ini"
    "/inventory.ini"
    ".tmp-keys/"
    "*.retry"
  )
  local line added=0
  for line in "${entries[@]}"; do
    if ! grep -qxF "$line" "$gitignore" 2>/dev/null; then
      if [[ "$added" -eq 0 ]]; then
        printf '\n# Local deploy (Ansible inventory / keys)\n' >>"$gitignore"
        added=1
      fi
      printf '%s\n' "$line" >>"$gitignore"
      echo "Added to .gitignore: $line"
    fi
  done
}

load_dotenv_safe() {
  local env_file="$REPO_ROOT/.env"
  [[ -f "$env_file" ]] || return 0
  command -v python3 >/dev/null 2>&1 || {
    echo "Нужен python3 для чтения .env (JSON в MASTER_IP). Задайте переменные вручную." >&2
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

ensure_gitignore_entries
load_dotenv_safe

: "${SSH_PRIVATE_KEY:=$HOME/.ssh/id_ed25519}"

if [[ -z "${MASTER_IP:-}" ]]; then
  echo "Не задан MASTER_IP (JSON {\"address\",\"password\"}) — .env или export." >&2
  exit 1
fi

if [[ ! -f "$SSH_PRIVATE_KEY" ]]; then
  echo "Нет файла ключа: $SSH_PRIVATE_KEY (задайте SSH_PRIVATE_KEY=...)." >&2
  exit 1
fi

chmod 600 "$SSH_PRIVATE_KEY" 2>/dev/null || true

[[ -n "${NODE_IPS:-}" ]] && export NODE_IPS

echo "==> ansible-galaxy collection install (posix, community.general)"
ansible-galaxy collection install ansible.posix community.general

echo "==> ci-write-inventory.yml → ansible/inventory.ini"
(
  cd "$REPO_ROOT/ansible"
  ansible-playbook -i localhost, ci/ci-write-inventory.yml
)

export ANSIBLE_HOST_KEY_CHECKING="${ANSIBLE_HOST_KEY_CHECKING:-False}"

echo "==> ping master"
(
  cd "$REPO_ROOT/ansible"
  ansible master -i inventory.ini -m ping --private-key "$SSH_PRIVATE_KEY"
)

echo "==> 3xui/deploy-panel.yml --syntax-check"
(
  cd "$REPO_ROOT/ansible"
  ansible-playbook -i inventory.ini 3xui/deploy-panel.yml --syntax-check --private-key "$SSH_PRIVATE_KEY"
)

echo "==> 3xui/deploy-panel.yml"
(
  cd "$REPO_ROOT/ansible"
  ansible-playbook -i inventory.ini 3xui/deploy-panel.yml --private-key "$SSH_PRIVATE_KEY"
)

echo "Готово (панель)."
