#!/usr/bin/env bash
# Полное восстановление после сноса: панель 3x-ui + Postgres бота (оба файла бэкапа).
#
#   bash scripts/restore_from_backups.sh /path/to/x-ui.db /path/to/app.sql
#   bash scripts/restore_from_backups.sh --deploy-nodes /path/to/x-ui.db /path/to/app.dump
#
# Сначала вручную (GitHub Actions или scripts): Bootstrap → Deploy 3x-ui panel → Deploy Bot.
# См. docs/RESTORE.md
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/restore-common.sh
source "$REPO_ROOT/scripts/lib/restore-common.sh"

DEPLOY_NODES=0
PANEL_DB=""
PG_BACKUP=""

usage() {
  cat <<'EOF'
Usage: bash scripts/restore_from_backups.sh [OPTIONS] PANEL_DB PG_BACKUP

  PANEL_DB   — бэкап SQLite панели (x-ui.db)
  PG_BACKUP  — бэкап Postgres бота (.sql или pg_dump -Fc .dump)

Options:
  --deploy-nodes   после восстановления запустить scripts/deploy_3xui_nodes.sh
  -h, --help

Порядок инфраструктуры (до этого скрипта):
  1. Bootstrap Infrastructure
  2. Deploy 3x-ui → target: panel
  3. Deploy Bot
  4. Этот скрипт (панель, затем Postgres)
  5. Deploy 3x-ui → target: nodes  (или --deploy-nodes)

Документация: docs/RESTORE.md
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h | --help)
      usage
      exit 0
      ;;
    --deploy-nodes)
      DEPLOY_NODES=1
      shift
      ;;
    -*)
      echo "Неизвестный аргумент: $1" >&2
      usage >&2
      exit 1
      ;;
    *)
      if [[ -z "$PANEL_DB" ]]; then
        PANEL_DB="$1"
      elif [[ -z "$PG_BACKUP" ]]; then
        PG_BACKUP="$1"
      else
        echo "Лишний аргумент: $1" >&2
        exit 1
      fi
      shift
      ;;
  esac
done

if [[ -z "$PANEL_DB" || -z "$PG_BACKUP" ]]; then
  usage >&2
  exit 1
fi

restore_require_file "$PANEL_DB" "panel backup"
restore_require_file "$PG_BACKUP" "postgres backup"

echo "==> [1/2] restore panel DB"
bash "$REPO_ROOT/scripts/restore_panel_db.sh" "$PANEL_DB"

echo "==> [2/2] restore app postgres"
bash "$REPO_ROOT/scripts/restore_app_postgres.sh" "$PG_BACKUP"

restore_load_dotenv "$REPO_ROOT/.env"
if [[ "$DEPLOY_NODES" == "1" ]]; then
  if [[ -z "${NODE_IPS:-}" ]]; then
    echo "Пропуск --deploy-nodes: NODE_IPS не задан в .env." >&2
  else
    echo "==> [3/3] deploy 3x-ui nodes"
    bash "$REPO_ROOT/scripts/deploy_3xui_nodes.sh"
  fi
else
  echo "Подсказка: если ноды Offline — Deploy 3x-ui (nodes) или:"
  echo "  bash scripts/restore_from_backups.sh --deploy-nodes ..."
fi

MASTER_ADDR="$(restore_master_address 2>/dev/null)" || MASTER_ADDR="<master>"
echo ""
echo "Готово. Проверьте:"
echo "  - https://<DOMAIN>/panel/ — inbounds, Nodes"
echo "  - Telegram «Мои ключи»"
echo "  - bash scripts/check-bot-stack-remote.sh (нужен SSH на ${MASTER_ADDR})"
