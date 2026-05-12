#!/usr/bin/env bash
# Полный локальный цикл «как с нуля»: сначала bootstrap (master + ноды из inventory),
# затем деплой бота на master (как deploy-bot.yml).
#
# Требуются переменные из .env / export для ОБОИХ шагов (см. BOOTSTRAP.md и DEPLOY_BOT.md):
#   bootstrap: MASTER_IP, DOMAIN_NAME, SSH_PUBLIC_KEY (+ NODE_IPS при нодах)
#   бот:       те же + VPN_ADMIN_*, TELEGRAM_BOT_TOKEN, ENCRYPTION_KEY, GITHUB_TOKEN, GITHUB_ACTOR,
#              и APP_IMAGE или флаг --build для сборки образа
#
# Запуск из корня репозитория в WSL:
#   bash scripts/deploy_bootstrap_then_bot.sh
#   bash scripts/deploy_bootstrap_then_bot.sh --build
#
# Аргументы передаются только в scripts/deploy_bot.sh (например --build).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "========== 1/2 bootstrap =========="
bash "$ROOT/scripts/deploy_bootstrap.sh"

echo "========== 2/2 deploy bot =========="
bash "$ROOT/scripts/deploy_bot.sh" "$@"

echo "========== Готово: bootstrap + бот =========="
