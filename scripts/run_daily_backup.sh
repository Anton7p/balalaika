#!/usr/bin/env bash
# Разовый запуск ежедневного бэкапа на master (без ожидания cron).
#
#   bash scripts/run_daily_backup.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/restore-common.sh
source "$REPO_ROOT/scripts/lib/restore-common.sh"

restore_load_dotenv "$REPO_ROOT/.env"
MASTER_ADDR="$(restore_master_address)" || exit 1
SSH_KEY="$(restore_ssh_key)" || exit 1

REMOTE_SCRIPT="/opt/infrastructure/backup/backup-daily-to-telegram.sh"

echo "==> run backup on root@${MASTER_ADDR}"
ssh -i "$SSH_KEY" -o BatchMode=yes -o "StrictHostKeyChecking=${STRICT_HOST_KEY_CHECKING:-accept-new}" \
  "root@${MASTER_ADDR}" \
  "test -x ${REMOTE_SCRIPT} && ${REMOTE_SCRIPT} || { echo 'Нет ${REMOTE_SCRIPT} — bash scripts/install_daily_backup_cron.sh'; exit 1; }"

echo "Готово. Проверьте Telegram у админа (TELEGRAM_ADMIN_ID)."
