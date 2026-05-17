#!/usr/bin/env bash
# Выполняется на master или ноде (ansible script / ssh bash -s).
# Останавливает стеки balalaika и удаляет данные панели и приложения.
set -euo pipefail

PANEL_DIR="${PANEL_DIR:-/opt/infrastructure/panel}"
APP_DIR="${APP_DIR:-/opt/infrastructure/app}"
PANEL_PROJECT="${PANEL_PROJECT:-panel}"

echo "=== teardown on $(hostname) ==="

if [[ -f "${APP_DIR}/docker-compose.yml" ]]; then
  echo "==> app: docker compose down -v"
  (cd "${APP_DIR}" && docker compose down -v --remove-orphans) || true
  rm -rf "${APP_DIR}"
fi

if [[ -f "${PANEL_DIR}/docker-compose.yml" ]]; then
  echo "==> panel: docker compose down -v"
  (cd "${PANEL_DIR}" && docker compose -f docker-compose.yml -p "${PANEL_PROJECT}" down -v --remove-orphans) || true
fi

if [[ -d "${PANEL_DIR}/db" ]]; then
  echo "==> panel: remove db"
  rm -rf "${PANEL_DIR}/db"
fi

echo "=== teardown done ==="
