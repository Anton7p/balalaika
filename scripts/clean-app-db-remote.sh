#!/usr/bin/env bash
# На master: очистить Postgres (users/subscriptions/audit) и ключи <APP_NAMESPACE>:* в Redis.
set -euo pipefail
cd /opt/infrastructure/app

read_env() {
  local key="$1"
  if [[ -f .env ]]; then
    grep -E "^${key}=" .env | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | xargs || true
  fi
}

namespace_from_domain() {
  local d="${1,,}"
  d="${d#www.}"
  d="$(echo "$d" | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g')"
  if [[ -z "$d" ]]; then
    echo "vpnbot"
  else
    echo "${d:0:63}"
  fi
}

APP_NS="$(read_env APP_NAMESPACE)"
if [[ -z "$APP_NS" ]]; then
  DOMAIN="$(read_env DOMAIN_NAME)"
  APP_NS="$(namespace_from_domain "${DOMAIN:-}")"
fi

echo "=== APP_NAMESPACE=${APP_NS} ==="

echo "=== BEFORE ==="
docker compose exec -T postgres psql -U postgres -d app -c "
SELECT (SELECT count(*) FROM users) AS users,
       (SELECT count(*) FROM subscriptions) AS subscriptions,
       (SELECT count(*) FROM access_audit_logs) AS audit;
"

echo "=== TRUNCATE ==="
docker compose exec -T postgres psql -U postgres -d app -c "
TRUNCATE TABLE access_audit_logs, subscriptions, users RESTART IDENTITY CASCADE;
"

echo "=== AFTER ==="
docker compose exec -T postgres psql -U postgres -d app -c "
SELECT (SELECT count(*) FROM users) AS users,
       (SELECT count(*) FROM subscriptions) AS subscriptions,
       (SELECT count(*) FROM access_audit_logs) AS audit;
"

echo "=== Redis ${APP_NS}:* ==="
docker compose exec -T redis sh -c "
  auth=''
  if [ -n \"\${REDIS_PASSWORD:-}\" ]; then auth=\"-a \$REDIS_PASSWORD --no-auth-warning\"; fi
  eval \"redis-cli \$auth KEYS '${APP_NS}:*'\" || true
  for k in \$(eval \"redis-cli \$auth KEYS '${APP_NS}:*'\"); do
    eval \"redis-cli \$auth DEL \\\"\$k\\\"\"
  done
  echo cleared
"

echo "=== DONE ==="
