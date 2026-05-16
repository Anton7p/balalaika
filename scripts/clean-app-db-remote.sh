#!/usr/bin/env bash
# На master: очистить Postgres (users/subscriptions/audit) и ключи balalaika:* в Redis.
set -euo pipefail
cd /opt/infrastructure/app

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

echo "=== Redis balalaika:* ==="
docker compose exec -T redis sh -c '
  auth=""
  if [ -n "${REDIS_PASSWORD:-}" ]; then auth="-a $REDIS_PASSWORD --no-auth-warning"; fi
  eval "redis-cli $auth KEYS \"balalaika:*\"" || true
  for k in $(eval "redis-cli $auth KEYS \"balalaika:*\""); do
    eval "redis-cli $auth DEL \"$k\""
  done
  echo cleared
'

echo "=== DONE ==="
