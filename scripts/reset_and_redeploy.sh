#!/usr/bin/env bash
# С нуля: teardown → панель master → ноды → бот (--build по умолчанию).
#
#   bash scripts/reset_and_redeploy.sh
#   bash scripts/reset_and_redeploy.sh --no-build   # APP_IMAGE уже в .env
#
# Переменные — как в deploy_bootstrap_then_bot.sh (.env или export).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

load_dotenv_safe() {
  local env_file="$ROOT/.env"
  [[ -f "$env_file" ]] || return 0
  command -v python3 >/dev/null 2>&1 || return 0
  eval "$(
    ENV_FILE="$env_file" python3 <<'PY'
import os, pathlib, shlex

p = pathlib.Path(os.environ["ENV_FILE"])
for raw in p.read_text(encoding="utf-8", errors="replace").splitlines():
    s = raw.strip()
    if not s or s.startswith("#") or "=" not in s:
        continue
    k, v = s.split("=", 1)
    k, v = k.strip(), v.strip()
    if not k:
        continue
    if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
        v = v[1:-1]
    print(f"export {shlex.quote(k)}={shlex.quote(v)}")
PY
  )"
}

load_dotenv_safe

BUILD_ARGS=(--build)
for a in "$@"; do
  [[ "$a" == "--no-build" ]] && BUILD_ARGS=()
done

echo "========== teardown =========="
bash "$ROOT/scripts/teardown_infrastructure.sh"

echo "========== 3x-ui panel (master) =========="
bash "$ROOT/scripts/deploy_3xui_panel.sh"

if [[ -n "${NODE_IPS:-}" ]]; then
  echo "========== 3x-ui nodes =========="
  bash "$ROOT/scripts/deploy_3xui_nodes.sh"
else
  echo "========== 3x-ui nodes — пропуск (NODE_IPS не задан) =========="
fi

echo "========== deploy bot =========="
if ((${#BUILD_ARGS[@]})); then
  bash "$ROOT/scripts/deploy_bot.sh" "${BUILD_ARGS[@]}"
else
  bash "$ROOT/scripts/deploy_bot.sh"
fi

echo "========== Готово: reset + redeploy =========="
