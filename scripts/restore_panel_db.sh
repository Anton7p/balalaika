#!/usr/bin/env bash
# Восстановление SQLite панели 3x-ui на master из локального файла бэкапа.
#
#   bash scripts/restore_panel_db.sh /path/to/x-ui.db
#   bash scripts/restore_panel_db.sh --on-master /path/to/x-ui.db   # уже на master
#
# Перед первым восстановлением на чистом хосте: Deploy 3x-ui (panel) — см. docs/RESTORE.md
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/restore-common.sh
source "$REPO_ROOT/scripts/lib/restore-common.sh"

ON_MASTER=0
BACKUP_LOCAL=""

usage() {
  cat <<'EOF'
Usage: bash scripts/restore_panel_db.sh [--on-master] PANEL_DB_FILE

  PANEL_DB_FILE — бэкап SQLite панели (x-ui.db или файл из Telegram-бэкапа).

  --on-master   скрипт уже запущен на master (без scp/ssh).

Нужны: каталог /opt/infrastructure/panel (после Deploy 3x-ui panel).
Локально: MASTER_IP и SSH_PRIVATE_KEY в .env (или inventory.ini).
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h | --help)
      usage
      exit 0
      ;;
    --on-master)
      ON_MASTER=1
      shift
      ;;
    -*)
      echo "Неизвестный аргумент: $1" >&2
      usage >&2
      exit 1
      ;;
    *)
      if [[ -n "$BACKUP_LOCAL" ]]; then
        echo "Лишний аргумент: $1" >&2
        exit 1
      fi
      BACKUP_LOCAL="$1"
      shift
      ;;
  esac
done

if [[ -z "$BACKUP_LOCAL" ]]; then
  usage >&2
  exit 1
fi

restore_require_file "$BACKUP_LOCAL" "panel backup"

if [[ "$ON_MASTER" == "1" ]]; then
  REMOTE_PATH="$(readlink -f "$BACKUP_LOCAL" 2>/dev/null || realpath "$BACKUP_LOCAL" 2>/dev/null || printf '%s' "$BACKUP_LOCAL")"
  export BACKUP_FILE="$REMOTE_PATH"
  exec bash "$REPO_ROOT/scripts/restore-panel-db-remote.sh"
fi

restore_load_dotenv "$REPO_ROOT/.env"
MASTER_ADDR="$(restore_master_address)" || exit 1
SSH_KEY="$(restore_ssh_key)" || exit 1
REMOTE_PATH="/tmp/vpnbox-restore-panel-${RANDOM}.db"

echo "==> scp panel backup → root@${MASTER_ADDR}:${REMOTE_PATH}"
scp -i "$SSH_KEY" -o BatchMode=yes -o "StrictHostKeyChecking=${STRICT_HOST_KEY_CHECKING:-accept-new}" \
  "$BACKUP_LOCAL" "root@${MASTER_ADDR}:${REMOTE_PATH}"

echo "==> restore on master"
ssh -i "$SSH_KEY" -o BatchMode=yes -o "StrictHostKeyChecking=${STRICT_HOST_KEY_CHECKING:-accept-new}" \
  "root@${MASTER_ADDR}" \
  "BACKUP_FILE=$(printf '%q' "$REMOTE_PATH") bash -s" \
  <"$REPO_ROOT/scripts/restore-panel-db-remote.sh"

ssh -i "$SSH_KEY" -o BatchMode=yes -o "StrictHostKeyChecking=${STRICT_HOST_KEY_CHECKING:-accept-new}" \
  "root@${MASTER_ADDR}" "rm -f $(printf '%q' "$REMOTE_PATH")" || true

echo "Готово: панель восстановлена на ${MASTER_ADDR}."
