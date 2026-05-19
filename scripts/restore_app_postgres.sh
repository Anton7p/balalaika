#!/usr/bin/env bash
# Восстановление Postgres бота на master из локального .sql или pg_dump -Fc (.dump).
#
#   bash scripts/restore_app_postgres.sh /path/to/app.sql
#   bash scripts/restore_app_postgres.sh --format custom /path/to/app.dump
#   bash scripts/restore_app_postgres.sh --on-master /path/to/backup.sql
#
# Перед первым восстановлением: Deploy Bot — см. docs/RESTORE.md
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/restore-common.sh
source "$REPO_ROOT/scripts/lib/restore-common.sh"

ON_MASTER=0
BACKUP_LOCAL=""
BACKUP_FORMAT="auto"

usage() {
  cat <<'EOF'
Usage: bash scripts/restore_app_postgres.sh [--format sql|custom|auto] [--on-master] PG_BACKUP_FILE

  PG_BACKUP_FILE — дамп Postgres приложения (.sql или pg_dump -Fc .dump).

  --format auto   по расширению и заголовку PGDMP (по умолчанию)
  --on-master     скрипт уже на master

Нужны: /opt/infrastructure/app (после Deploy Bot), тот же ENCRYPTION_KEY, что при бэкапе.
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
    --format)
      BACKUP_FORMAT="${2:?}"
      shift 2
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

restore_require_file "$BACKUP_LOCAL" "postgres backup"
DETECTED="$(restore_detect_pg_format "$BACKUP_LOCAL")"
if [[ "$BACKUP_FORMAT" == "auto" ]]; then
  BACKUP_FORMAT="$DETECTED"
fi
echo "==> формат бэкапа: $BACKUP_FORMAT (detected=$DETECTED)"

if [[ "$ON_MASTER" == "1" ]]; then
  REMOTE_PATH="$(readlink -f "$BACKUP_LOCAL" 2>/dev/null || realpath "$BACKUP_LOCAL" 2>/dev/null || printf '%s' "$BACKUP_LOCAL")"
  export BACKUP_FILE="$REMOTE_PATH"
  export BACKUP_FORMAT
  exec bash "$REPO_ROOT/scripts/restore-app-postgres-remote.sh"
fi

restore_load_dotenv "$REPO_ROOT/.env"
MASTER_ADDR="$(restore_master_address)" || exit 1
SSH_KEY="$(restore_ssh_key)" || exit 1
ext=".sql"
[[ "$BACKUP_FORMAT" == "custom" ]] && ext=".dump"
REMOTE_PATH="/tmp/vpnbox-restore-pg-${RANDOM}${ext}"

echo "==> scp postgres backup → root@${MASTER_ADDR}:${REMOTE_PATH}"
scp -i "$SSH_KEY" -o BatchMode=yes -o "StrictHostKeyChecking=${STRICT_HOST_KEY_CHECKING:-accept-new}" \
  "$BACKUP_LOCAL" "root@${MASTER_ADDR}:${REMOTE_PATH}"

echo "==> restore on master"
ssh -i "$SSH_KEY" -o BatchMode=yes -o "StrictHostKeyChecking=${STRICT_HOST_KEY_CHECKING:-accept-new}" \
  "root@${MASTER_ADDR}" \
  "BACKUP_FILE=$(printf '%q' "$REMOTE_PATH") BACKUP_FORMAT=$(printf '%q' "$BACKUP_FORMAT") bash -s" \
  <"$REPO_ROOT/scripts/restore-app-postgres-remote.sh"

ssh -i "$SSH_KEY" -o BatchMode=yes -o "StrictHostKeyChecking=${STRICT_HOST_KEY_CHECKING:-accept-new}" \
  "root@${MASTER_ADDR}" "rm -f $(printf '%q' "$REMOTE_PATH")" || true

echo "Готово: Postgres восстановлен на ${MASTER_ADDR}."
echo "Проверка: bash scripts/check-bot-stack-remote.sh (через deploy_bot или ssh)."
