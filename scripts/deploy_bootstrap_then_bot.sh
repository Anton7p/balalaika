#!/usr/bin/env bash
# Полный локальный цикл «как с нуля»: bootstrap → панель 3x-ui на master → (опционально) ноды 3x-ui → бот.
#
# Требуются переменные из .env / export:
#   bootstrap: MASTER_IP, DOMAIN_NAME, SSH_PUBLIC_KEY (+ NODE_IPS при нодах в inventory)
#   панель 3x-ui: MASTER_IP, SSH_PRIVATE_KEY, DOMAIN_NAME, VPN_ADMIN_USERNAME, VPN_ADMIN_PASSWORD;
#   опционально TELEGRAM_BOT_ADMIN + TELEGRAM_ADMIN_ID (уведомления панели).
#   ноды 3x-ui: NODE_IPS (JSON-массив) — шаг пропускается, если переменная пустая
#   бот: VPN_ADMIN_*, TELEGRAM_BOT_TOKEN, ENCRYPTION_KEY, GITHUB_TOKEN, GITHUB_ACTOR,
#        и APP_IMAGE или флаг --build
#
# Запуск из корня репозитория в WSL:
#   bash scripts/deploy_bootstrap_then_bot.sh
#   bash scripts/deploy_bootstrap_then_bot.sh --build
#
# Аргументы передаются только в scripts/deploy_bot.sh (например --build).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

load_dotenv_safe() {
  local env_file="$ROOT/.env"
  [[ -f "$env_file" ]] || return 0
  command -v python3 >/dev/null 2>&1 || {
    echo "Нужен python3 для чтения .env (NODE_IPS / MASTER_IP)." >&2
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

echo "========== bootstrap =========="
bash "$ROOT/scripts/deploy_bootstrap.sh"

echo "========== 3x-ui panel (master) =========="
bash "$ROOT/scripts/deploy_3xui_panel.sh"

if [[ -n "${NODE_IPS:-}" ]]; then
  echo "========== 3x-ui nodes =========="
  bash "$ROOT/scripts/deploy_3xui_nodes.sh"
else
  echo "========== 3x-ui nodes — пропуск (NODE_IPS не задан) =========="
fi

echo "========== deploy bot =========="
bash "$ROOT/scripts/deploy_bot.sh" "$@"

echo "========== Готово: bootstrap + 3x-ui + бот =========="
