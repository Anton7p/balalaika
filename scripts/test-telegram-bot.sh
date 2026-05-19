#!/usr/bin/env bash
# Проверка: жив ли токен бота и может ли сервер (или ваш ПК) достучаться до Telegram.
#
#   bash scripts/test-telegram-bot.sh <BOT_TOKEN> <CHAT_ID>
#   bash scripts/test-telegram-bot.sh <BOT_TOKEN> <CHAT_ID> --on-master
#
# CHAT_ID — ваш TELEGRAM_ADMIN_ID (только цифры).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/restore-common.sh
source "$REPO_ROOT/scripts/lib/restore-common.sh"

ON_MASTER=0
TOKEN=""
CHAT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --on-master) ON_MASTER=1; shift ;;
    -h | --help)
      echo "Usage: bash scripts/test-telegram-bot.sh <BOT_TOKEN> <CHAT_ID> [--on-master]"
      exit 0
      ;;
    *)
      if [[ -z "$TOKEN" ]]; then TOKEN="$1"
      elif [[ -z "$CHAT" ]]; then CHAT="$1"
      else echo "Лишний аргумент: $1" >&2; exit 1
      fi
      shift
      ;;
  esac
done

if [[ -z "$TOKEN" || -z "$CHAT" ]]; then
  echo "Нужны BOT_TOKEN и CHAT_ID (ваш TELEGRAM_ADMIN_ID)." >&2
  exit 1
fi

run_test() {
  local label="$1"
  echo "=== $label ==="
  echo "getMe:"
  local me
  me="$(curl -fsS "https://api.telegram.org/bot${TOKEN}/getMe" 2>&1)" || {
    echo "FAIL: getMe — нет ответа или сеть заблокирована"
    return 1
  }
  echo "$me"
  if ! echo "$me" | grep -q '"ok":true'; then
    echo "FAIL: токен не принят Telegram (ok:false или 401)"
    return 1
  fi
  echo ""
  echo "sendMessage (тест в чат $CHAT):"
  local msg
  msg="$(curl -fsS -X POST "https://api.telegram.org/bot${TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${CHAT}" \
    --data-urlencode "text=VPN bot test: token OK from ${label}" 2>&1)" || {
    echo "FAIL: sendMessage — сеть или chat_id"
    echo "$msg"
    return 1
  }
  echo "$msg"
  if echo "$msg" | grep -q '"ok":true'; then
    echo "OK: сообщение должно прийти в Telegram. Если нет — смотрите chat_id и /start у этого бота."
    return 0
  fi
  echo "FAIL: Telegram отклонил отправку (часто неверный chat_id или не нажали /start)"
  return 1
}

if [[ "$ON_MASTER" == "1" ]]; then
  run_test "this server"
  exit $?
fi

echo "==> тест с вашего ПК"
if ! run_test "your PC"; then
  exit 1
fi

restore_load_dotenv "$REPO_ROOT/.env" 2>/dev/null || true
if MASTER_ADDR="$(restore_master_address 2>/dev/null)"; then
  SSH_KEY="$(restore_ssh_key 2>/dev/null)" || true
  if [[ -n "${SSH_KEY:-}" && -f "$SSH_KEY" ]]; then
    echo ""
    echo "==> тест с master ($MASTER_ADDR) — как панель 3x-ui"
    ssh -i "$SSH_KEY" -o BatchMode=yes -o "StrictHostKeyChecking=${STRICT_HOST_KEY_CHECKING:-accept-new}" \
      "root@${MASTER_ADDR}" \
      "TOKEN=$(printf '%q' "$TOKEN") CHAT=$(printf '%q' "$CHAT") bash -s" <<'REMOTE'
set -euo pipefail
echo "=== master server ==="
me=$(curl -fsS "https://api.telegram.org/bot${TOKEN}/getMe" 2>&1) || { echo "FAIL getMe from master (сеть?)"; echo "$me"; exit 1; }
echo "getMe: $me"
echo "$me" | grep -q '"ok":true' || { echo "FAIL token on master"; exit 1; }
msg=$(curl -fsS -X POST "https://api.telegram.org/bot${TOKEN}/sendMessage" \
  --data-urlencode "chat_id=${CHAT}" \
  --data-urlencode "text=VPN bot test: from MASTER server" 2>&1) || { echo "FAIL sendMessage from master"; echo "$msg"; exit 1; }
echo "sendMessage: $msg"
echo "$msg" | grep -q '"ok":true' && echo "OK from master" || { echo "FAIL chat_id or /start"; exit 1; }
REMOTE
  fi
fi
