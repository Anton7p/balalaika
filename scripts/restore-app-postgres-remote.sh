#!/usr/bin/env bash
# Выполняется на master: восстановление Postgres приложения из .sql или pg_dump -Fc.
# Переменные: BACKUP_FILE, BACKUP_FORMAT=sql|custom|auto
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/infrastructure/app}"
BACKUP_FILE="${BACKUP_FILE:?set BACKUP_FILE}"
BACKUP_FORMAT="${BACKUP_FORMAT:-auto}"

if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "FAIL: backup not found: $BACKUP_FILE" >&2
  exit 1
fi
if [[ ! -s "$BACKUP_FILE" ]]; then
  echo "FAIL: backup is empty: $BACKUP_FILE" >&2
  exit 1
fi

cd "$APP_DIR" || {
  echo "FAIL: нет каталога $APP_DIR — сначала Deploy Bot." >&2
  exit 1
}

if ! docker compose config --services 2>/dev/null | grep -qx 'postgres'; then
  echo "FAIL: сервис postgres не найден в docker compose." >&2
  exit 1
fi

detect_format() {
  case "$BACKUP_FORMAT" in
    sql | custom) printf '%s' "$BACKUP_FORMAT" ;;
    auto)
      local ext="${BACKUP_FILE##*.}"
      ext="${ext,,}"
      case "$ext" in
        sql) printf 'sql' ;;
        dump | backup) printf 'custom' ;;
        *)
          if head -c 5 "$BACKUP_FILE" | grep -q '^PGDMP'; then
            printf 'custom'
          else
            printf 'sql'
          fi
          ;;
      esac
      ;;
    *)
      echo "FAIL: BACKUP_FORMAT must be sql, custom, or auto" >&2
      exit 1
      ;;
  esac
}

fmt="$(detect_format)"
stamp="$(date +%Y%m%d-%H%M%S)"
dump_pre="/tmp/app-postgres.before-restore.${stamp}.dump"

echo "==> stop app vpn-watchdog (postgres оставляем)"
docker compose stop app vpn-watchdog 2>/dev/null || true

echo "==> pre-restore dump (на всякий случай) → $dump_pre"
if docker compose exec -T postgres pg_isready -U postgres -d app >/dev/null 2>&1; then
  docker compose exec -T postgres pg_dump -U postgres -Fc app >"$dump_pre" || true
fi

reset_schema() {
  docker compose exec -T postgres psql -U postgres -d app -v ON_ERROR_STOP=1 <<'SQL'
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;
SQL
}

echo "==> очистить схему public"
reset_schema

echo "==> restore format=$fmt from $BACKUP_FILE"
case "$fmt" in
  sql)
    docker compose exec -T postgres psql -U postgres -d app -v ON_ERROR_STOP=1 <"$BACKUP_FILE"
    ;;
  custom)
    docker compose exec -T postgres pg_restore -U postgres -d app --no-owner --role=postgres --exit-on-error <"$BACKUP_FILE"
    ;;
esac

echo "==> поднять стек"
docker compose up -d

echo "==> counts"
docker compose exec -T postgres psql -U postgres -d app -c "
SELECT (SELECT count(*) FROM users) AS users,
       (SELECT count(*) FROM subscriptions) AS subscriptions,
       (SELECT count(*) FROM access_audit_logs) AS audit;
" || true

echo "OK: Postgres restored. Нужен тот же ENCRYPTION_KEY, что при создании бэкапа."
