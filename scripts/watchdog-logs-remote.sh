#!/usr/bin/env bash
# На master: статус стека и последние логи vpn-watchdog.
set -euo pipefail
APP_DIR=/opt/infrastructure/app
cd "$APP_DIR" || { echo "FAIL: нет $APP_DIR"; exit 1; }
echo "=== $(date -Is) ==="
docker compose ps vpn-watchdog app 2>/dev/null || docker compose ps
echo "=== vpn-watchdog logs (tail ${1:-100}) ==="
docker compose logs vpn-watchdog --tail="${1:-100}" --no-log-prefix 2>&1
