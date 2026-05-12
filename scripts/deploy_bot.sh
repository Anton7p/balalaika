#!/usr/bin/env bash
# Локальный деплой бота (аналог .github/workflows/deploy-bot.yml): inventory → deploy-app.yml → проверка стека.
#
#   bash scripts/deploy_bot.sh           — нужен APP_IMAGE в .env или в окружении
#   bash scripts/deploy_bot.sh --build   — docker buildx + push в GHCR, затем деплой
#
# Из корня репозитория в WSL/Linux. На Windows-диске при CRLF: sed -i 's/\r$//' scripts/deploy_bot.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

DO_BUILD=0
for a in "$@"; do [[ "$a" == "--build" ]] && DO_BUILD=1; done
[[ "${DEPLOY_BOT_BUILD:-0}" == "1" ]] && DO_BUILD=1

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
        printf '\n# Local deploy (scripts/deploy_bot.sh / scripts/deploy_bootstrap.sh)\n' >>"$gitignore"
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
    echo "Нужен python3 для чтения .env (JSON в MASTER_IP и т.д.)." >&2
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

infer_ghcr_repo_lc() {
  REPO_ROOT="$REPO_ROOT" python3 <<'PY'
import os, re, subprocess

root = os.environ["REPO_ROOT"]
r = subprocess.run(
    ["git", "-C", root, "config", "--get", "remote.origin.url"],
    capture_output=True,
    text=True,
)
if r.returncode != 0 or not r.stdout.strip():
    raise SystemExit("Не найден git remote.origin.url — задайте APP_IMAGE вручную.")
url = r.stdout.strip()
m = re.search(r"github\.com[:/]([^/]+)/([^/.]+?)(?:\.git)?/?$", url)
if not m:
    raise SystemExit(f"Не разобрал URL для GHCR: {url}")
print(f"{m.group(1)}/{m.group(2)}".lower())
PY
}

build_and_push_image() {
  command -v docker >/dev/null 2>&1 || {
    echo "Для --build нужен docker в PATH." >&2
    exit 1
  }
  local repo_lc tag
  repo_lc="$(infer_ghcr_repo_lc)"
  tag="deploy-$(git -C "$REPO_ROOT" rev-parse HEAD)"
  APP_IMAGE="ghcr.io/${repo_lc}:${tag}"
  export APP_IMAGE
  echo "==> docker login ghcr.io (user: $GITHUB_ACTOR)"
  printf '%s' "$GITHUB_TOKEN" | docker login ghcr.io -u "$GITHUB_ACTOR" --password-stdin
  echo "==> docker buildx build --push → $APP_IMAGE"
  docker buildx build --push -t "$APP_IMAGE" -f "$REPO_ROOT/Dockerfile" "$REPO_ROOT"
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

ensure_gitignore_entries
load_dotenv_safe

: "${SSH_PRIVATE_KEY:=$HOME/.ssh/id_ed25519}"

for var in MASTER_IP DOMAIN_NAME VPN_ADMIN_USERNAME VPN_ADMIN_PASSWORD TELEGRAM_BOT_TOKEN ENCRYPTION_KEY GITHUB_TOKEN GITHUB_ACTOR; do
  if [[ -z "${!var:-}" ]]; then
    echo "Не задана переменная: $var (.env или export)." >&2
    exit 1
  fi
done

if [[ ! -f "$SSH_PRIVATE_KEY" ]]; then
  echo "Нет файла ключа: $SSH_PRIVATE_KEY" >&2
  exit 1
fi
chmod 600 "$SSH_PRIVATE_KEY" 2>/dev/null || true

if [[ "$DO_BUILD" == "1" ]]; then
  build_and_push_image
elif [[ -z "${APP_IMAGE:-}" ]]; then
  echo "Задайте APP_IMAGE или запустите с --build (см. заголовок скрипта)." >&2
  exit 1
fi

echo "==> APP_IMAGE=$APP_IMAGE"
if [[ "$APP_IMAGE" == *:deploy- ]]; then
  echo "Некорректный APP_IMAGE: тег оканчивается на :deploy- без SHA." >&2
  exit 1
fi

echo "==> ansible-galaxy collection install"
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

export DOMAIN_NAME VPN_ADMIN_USERNAME VPN_ADMIN_PASSWORD TELEGRAM_BOT_TOKEN ENCRYPTION_KEY APP_IMAGE GITHUB_TOKEN GITHUB_ACTOR
[[ -n "${TELEGRAM_ADMIN_ID:-}" ]] && export TELEGRAM_ADMIN_ID
[[ -n "${APP_DB_PASSWORD:-}" ]] && export APP_DB_PASSWORD
[[ -n "${NODE_IPS:-}" ]] && export NODE_IPS

echo "==> bot/deploy-app.yml --syntax-check"
(
  cd "$REPO_ROOT/ansible"
  ansible-playbook -i inventory.ini bot/deploy-app.yml --syntax-check --private-key "$SSH_PRIVATE_KEY"
)

echo "==> bot/deploy-app.yml (pull + compose up + /health в плейбуке)"
(
  cd "$REPO_ROOT/ansible"
  ansible-playbook -i inventory.ini bot/deploy-app.yml --private-key "$SSH_PRIVATE_KEY"
)

MASTER_ADDR="$(master_host_from_inventory)"
echo "==> пост-проверка стека на root@$MASTER_ADDR"
cat "$REPO_ROOT/scripts/check-bot-stack-remote.sh" | ssh -i "$SSH_PRIVATE_KEY" -o BatchMode=yes -o StrictHostKeyChecking="${STRICT_HOST_KEY_CHECKING:-yes}" "root@${MASTER_ADDR}" bash -s

echo "Готово."
