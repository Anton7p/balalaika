#!/usr/bin/env bash
# Установка cron ежедневных бэкапов (Postgres + опционально панель) в Telegram.
#
#   bash scripts/install_daily_backup_cron.sh
#
# Нужны в .env: MASTER_IP, SSH_PRIVATE_KEY, TELEGRAM_ADMIN_ID,
#   TELEGRAM_BOT_TOKEN и/или TELEGRAM_BOT_ADMIN, DOMAIN_NAME.
# Опционально: BACKUP_CRON="30 3 * * *", BACKUP_INCLUDE_PANEL=true|false
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# shellcheck source=lib/restore-common.sh
source "$REPO_ROOT/scripts/lib/restore-common.sh"

load_dotenv_safe() {
  restore_load_dotenv "$REPO_ROOT/.env"
}

usage() {
  cat <<'EOF'
Usage: bash scripts/install_daily_backup_cron.sh

Устанавливает на master:
  /opt/infrastructure/backup/backup-daily-to-telegram.sh
  /opt/infrastructure/backup/telegram.env
  cron (по умолчанию 03:30 ежедневно)

Документация: docs/BACKUP.md
EOF
}

[[ "${1:-}" == "-h" || "${1:-}" == "--help" ]] && usage && exit 0

load_dotenv_safe

: "${SSH_PRIVATE_KEY:=$HOME/.ssh/id_ed25519}"

for v in MASTER_IP DOMAIN_NAME TELEGRAM_ADMIN_ID; do
  if [[ -z "${!v:-}" ]]; then
    echo "Не задана переменная $v (.env или export)." >&2
    exit 1
  fi
done

if [[ -z "${TELEGRAM_BOT_ADMIN:-}" && -z "${TELEGRAM_BOT_TOKEN:-}" ]]; then
  echo "Нужен TELEGRAM_BOT_ADMIN и/или TELEGRAM_BOT_TOKEN." >&2
  exit 1
fi

[[ -f "$SSH_PRIVATE_KEY" ]] || {
  echo "Нет SSH-ключа: $SSH_PRIVATE_KEY" >&2
  exit 1
}
chmod 600 "$SSH_PRIVATE_KEY" 2>/dev/null || true

export DOMAIN_NAME TELEGRAM_ADMIN_ID
[[ -n "${TELEGRAM_BOT_TOKEN:-}" ]] && export TELEGRAM_BOT_TOKEN
[[ -n "${TELEGRAM_BOT_ADMIN:-}" ]] && export TELEGRAM_BOT_ADMIN
[[ -n "${BACKUP_CRON:-}" ]] && export BACKUP_CRON
[[ -n "${BACKUP_INCLUDE_PANEL:-}" ]] && export BACKUP_INCLUDE_PANEL

echo "==> ci-write-inventory.yml"
(
  cd "$REPO_ROOT/ansible"
  ansible-playbook -i localhost, ci/ci-write-inventory.yml
)

export ANSIBLE_HOST_KEY_CHECKING="${ANSIBLE_HOST_KEY_CHECKING:-False}"

echo "==> bot/install-backup-cron.yml"
(
  cd "$REPO_ROOT/ansible"
  ansible-playbook -i inventory.ini bot/install-backup-cron.yml --private-key "$SSH_PRIVATE_KEY"
)

echo "Готово. Проверка: bash scripts/run_daily_backup.sh"
echo "Лог cron: ssh master tail -f /var/log/vpnbox-backup.log"
