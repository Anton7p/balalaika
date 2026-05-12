#!/usr/bin/env bash
# Выполняется на master (ssh … bash -s < this file)
set -e
APP_DIR=/opt/infrastructure/app
cd "$APP_DIR" || { echo "FAIL: нет каталога $APP_DIR"; exit 1; }
echo "=== docker compose ps ==="
docker compose ps -a
echo "=== postgres pg_isready ==="
docker compose exec -T postgres sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' && echo "postgres: OK" || echo "postgres: FAIL"
echo "=== redis PING ==="
docker compose exec -T redis sh -c 'if [ -n "$REDIS_PASSWORD" ]; then redis-cli -a "$REDIS_PASSWORD" ping; else redis-cli ping; fi'
echo "=== app /health (127.0.0.1:3000) ==="
code=$(curl -sS -o /tmp/h.txt -w "%{http_code}" --connect-timeout 8 http://127.0.0.1:3000/health || echo "000")
echo "http_code=$code"
head -c 800 /tmp/h.txt 2>/dev/null || true
echo
