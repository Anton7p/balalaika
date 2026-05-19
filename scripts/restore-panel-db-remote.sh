#!/usr/bin/env bash
# Выполняется на master: подмена SQLite БД панели 3x-ui.
# Переменные: BACKUP_FILE (путь к загруженному .db на master).
set -euo pipefail

PANEL_DIR="${PANEL_DIR:-/opt/infrastructure/panel}"
BACKUP_FILE="${BACKUP_FILE:?set BACKUP_FILE to uploaded x-ui.db path}"
TARGET_DB="${PANEL_DIR}/db/x-ui.db"

if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "FAIL: backup not found: $BACKUP_FILE" >&2
  exit 1
fi
if [[ ! -s "$BACKUP_FILE" ]]; then
  echo "FAIL: backup is empty: $BACKUP_FILE" >&2
  exit 1
fi

cd "$PANEL_DIR" || {
  echo "FAIL: нет каталога $PANEL_DIR — сначала Deploy 3x-ui (panel)." >&2
  exit 1
}

if ! docker compose config --services 2>/dev/null | grep -qx 'x-ui'; then
  echo "FAIL: сервис x-ui не найден в docker compose." >&2
  exit 1
fi

stamp="$(date +%Y%m%d-%H%M%S)"
mkdir -p db

echo "==> stop x-ui"
docker compose stop x-ui

if [[ -f "$TARGET_DB" ]]; then
  echo "==> сохранить текущую БД → db/x-ui.db.before-restore.${stamp}"
  cp -a "$TARGET_DB" "db/x-ui.db.before-restore.${stamp}"
fi

echo "==> установить бэкап → $TARGET_DB"
cp -a "$BACKUP_FILE" "$TARGET_DB"
chmod 600 "$TARGET_DB"

echo "==> start x-ui"
docker compose up -d x-ui

echo "==> статус"
docker compose ps x-ui
echo "OK: panel DB restored. Проверьте https://<DOMAIN_NAME>/panel/ (inbounds, Nodes)."
