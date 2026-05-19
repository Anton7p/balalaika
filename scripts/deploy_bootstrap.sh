#!/usr/bin/env bash
# Локальный прогон bootstrap (как bootstrap-infra.yml): inventory → bootstrap.yml.
# Запуск из WSL/Linux (из любого cwd):
#   bash /path/to/repo/scripts/deploy_bootstrap.sh
# или из корня репозитория:
#   bash scripts/deploy_bootstrap.sh
# На Windows-диске при CRLF: sed -i 's/\r$//' scripts/deploy_bootstrap.sh
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
        printf '\n# Local bootstrap / Ansible (scripts/deploy_bootstrap.sh)\n' >>"$gitignore"
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
    echo "Нужен python3, чтобы прочитать .env с JSON (MASTER_IP и т.д.). Задайте переменные вручную в shell."
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
: "${ANSIBLE_SSH_USERNAME:=root}"

for var in MASTER_IP DOMAIN_NAME SSH_PUBLIC_KEY; do
  if [[ -z "${!var:-}" ]]; then
    echo "Не задана переменная окружения: $var (экспорт или .env в корне репозитория)." >&2
    exit 1
  fi
done

if [[ ! -f "$SSH_PRIVATE_KEY" ]]; then
  echo "Нет файла ключа: $SSH_PRIVATE_KEY (задайте SSH_PRIVATE_KEY=...)." >&2
  exit 1
fi

chmod 600 "$SSH_PRIVATE_KEY" 2>/dev/null || true

echo "==> ansible-galaxy collection install (posix, community.general)"
ansible-galaxy collection install ansible.posix community.general

echo "==> ci-write-inventory.yml → ansible/inventory.ini"
(
  cd "$REPO_ROOT/ansible"
  ansible-playbook -i localhost, ci/ci-write-inventory.yml
)

echo "==> bootstrap/bootstrap.yml"
export DOMAIN_NAME SSH_PUBLIC_KEY ANSIBLE_SSH_USERNAME
export ANSIBLE_HOST_KEY_CHECKING="${ANSIBLE_HOST_KEY_CHECKING:-False}"
(
  cd "$REPO_ROOT/ansible"
  ansible-playbook -i inventory.ini bootstrap/bootstrap.yml --private-key "$SSH_PRIVATE_KEY"
)

echo "==> ping master (проверка SSH после bootstrap)"
(
  cd "$REPO_ROOT/ansible"
  ansible master -i inventory.ini -m ping --private-key "$SSH_PRIVATE_KEY"
)

if ANSIBLE_HOST_KEY_CHECKING="${ANSIBLE_HOST_KEY_CHECKING:-False}" ansible nodes -i "$REPO_ROOT/ansible/inventory.ini" --list-hosts 2>/dev/null | grep -q .; then
  echo "==> ping nodes"
  (
    cd "$REPO_ROOT/ansible"
    ansible nodes -i inventory.ini -m ping --private-key "$SSH_PRIVATE_KEY"
  )
fi

echo "Готово."
