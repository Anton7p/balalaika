#!/usr/bin/env bash
# Ежедневный бэкап Postgres приложения (+ опционально SQLite панели) → Telegram админу.
# Запуск: cron на master или вручную (см. scripts/run_daily_backup.sh).
set -euo pipefail

ENV_FILE="${BACKUP_ENV_FILE:-/opt/infrastructure/backup/telegram.env}"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "FAIL: нет $ENV_FILE (Deploy Bot или install_daily_backup_cron.sh)." >&2
  exit 1
fi
# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

for v in TELEGRAM_BOT_TOKEN TELEGRAM_CHAT_ID APP_DIR; do
  if [[ -z "${!v:-}" ]]; then
    echo "FAIL: пустая переменная $v в $ENV_FILE" >&2
    exit 1
  fi
done

PANEL_DIR="${PANEL_DIR:-/opt/infrastructure/panel}"
BACKUP_INCLUDE_PANEL="${BACKUP_INCLUDE_PANEL:-false}"
BACKUP_WORK_DIR="${BACKUP_WORK_DIR:-/opt/infrastructure/backup/work}"
TELEGRAM_MAX_BYTES="${TELEGRAM_MAX_BYTES:-47185920}"
DATE_STAMP="$(date +%Y-%m-%d)"
DOMAIN_TAG="${DOMAIN_NAME:-master}"

mkdir -p "$BACKUP_WORK_DIR"
TG_API="https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}"

tg_send_message() {
  local text="$1"
  curl -fsS -X POST "${TG_API}/sendMessage" \
    --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
    --data-urlencode "text=${text}" \
    --data-urlencode "disable_web_page_preview=true" >/dev/null
}

tg_send_document() {
  local file="$1"
  local caption="$2"
  local size
  size="$(wc -c <"$file" | tr -d ' ')"
  if [[ "$size" -gt "$TELEGRAM_MAX_BYTES" ]]; then
    tg_send_message "⚠️ ${caption}: файл ${size} байт (> лимита Telegram ~50 МБ). Сохраните бэкап на сервере: ${file}"
    return 1
  fi
  curl -fsS -X POST "${TG_API}/sendDocument" \
    -F "chat_id=${TELEGRAM_CHAT_ID}" \
    -F "document=@${file}" \
    -F "caption=${caption}" >/dev/null
}

backup_panel_sqlite() {
  local out_db="${BACKUP_WORK_DIR}/panel-${DATE_STAMP}.db"
  local out_gz="${out_db}.gz"
  if [[ ! -d "$PANEL_DIR" ]]; then
    echo "WARN: нет каталога панели $PANEL_DIR — пропуск panel backup"
    return 0
  fi
  cd "$PANEL_DIR"
  if ! docker compose config --services 2>/dev/null | grep -qx 'x-ui'; then
    echo "WARN: сервис x-ui не найден — пропуск panel backup"
    return 0
  fi
  echo "==> panel: stop x-ui, copy db"
  docker compose stop x-ui
  cp -a db/x-ui.db "$out_db"
  docker compose start x-ui
  gzip -f "$out_db"
  tg_send_document "$out_gz" "panel ${DOMAIN_TAG} ${DATE_STAMP}"
  echo "==> panel: sent $out_gz"
}

backup_app_postgres() {
  local out_gz="${BACKUP_WORK_DIR}/app-${DATE_STAMP}.dump.gz"
  if [[ ! -d "$APP_DIR" ]]; then
    echo "FAIL: нет каталога приложения $APP_DIR" >&2
    exit 1
  fi
  cd "$APP_DIR"
  if ! docker compose exec -T postgres pg_isready -U postgres -d app >/dev/null 2>&1; then
    echo "FAIL: postgres не готов в $APP_DIR" >&2
    exit 1
  fi
  echo "==> app: pg_dump"
  docker compose exec -T postgres pg_dump -U postgres -Fc app | gzip >"$out_gz"
  tg_send_document "$out_gz" "app postgres ${DOMAIN_TAG} ${DATE_STAMP}"
  echo "==> app: sent $out_gz"
}

errors=0
tg_send_message "🗄 VPN backup start (${DOMAIN_TAG} ${DATE_STAMP})" || errors=$((errors + 1))

if [[ "${BACKUP_INCLUDE_PANEL,,}" == "true" || "${BACKUP_INCLUDE_PANEL}" == "1" ]]; then
  backup_panel_sqlite || errors=$((errors + 1))
else
  echo "==> panel file backup skipped (BACKUP_INCLUDE_PANEL=false; панель — через 3x-ui tgBotBackup)"
fi

backup_app_postgres || errors=$((errors + 1))

find "$BACKUP_WORK_DIR" -type f -mtime +7 -delete 2>/dev/null || true

if [[ "$errors" -gt 0 ]]; then
  tg_send_message "⚠️ VPN backup finished with ${errors} error(s) (${DATE_STAMP})" || true
  exit 1
fi

tg_send_message "✅ VPN backup OK (${DOMAIN_TAG} ${DATE_STAMP})"
echo "OK: backup completed"
