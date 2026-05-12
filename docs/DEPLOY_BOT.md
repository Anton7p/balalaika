# Деплой Telegram-бота (Docker на master)

CI собирает образ приложения, пушит в **GHCR**, затем Ansible на **master** поднимает стек **Docker Compose** в **`/opt/infrastructure/app`**. Панель 3x-ui и nginx на хосте **не** меняются этим плейбуком.

## Workflow

**[`.github/workflows/deploy-bot.yml`](../.github/workflows/deploy-bot.yml)** — `workflow_dispatch`.

Кратко: checkout → Buildx → логин в **ghcr.io** → сборка и пуш тега **`ghcr.io/<repo lower>:deploy-<sha>`** (кеш слоёв **GHA**: `cache-from` / `cache-to`, для записи кеша в репозитории нужен **`permissions: actions: write`**) → установка Ansible → **`ci-write-inventory.yml`** → SSH **`ping`** → **`bot/deploy-app.yml --syntax-check`** → тот же плейбук с ключом → удаление **`.tmp-keys`**.

Секреты: **`MASTER_IP`**, **`SSH_PRIVATE_KEY`**, **`DOMAIN_NAME`**, **`VPN_ADMIN_USERNAME`**, **`VPN_ADMIN_PASSWORD`**, **`TELEGRAM_BOT_TOKEN`**, **`TELEGRAM_ADMIN_ID`**, **`ENCRYPTION_KEY`**, плюс **`GITHUB_TOKEN`** / actor для pull образа на сервере. Полный список имён: **[`GITHUB_SECRETS.md`](GITHUB_SECRETS.md)**.

## Ansible

| Что | Путь |
|-----|------|
| Плейбук | `ansible/bot/deploy-app.yml` (`hosts: master`) |
| Задачи | `ansible/bot/tasks/deploy/app-only.yml` |
| Шаблоны | `ansible/bot/templates/app-compose.yml.j2`, `app.env.j2` |

Переменные из **окружения контроллера** (`lookup('env', …)`): **`DOMAIN_NAME`**, **`VPN_ADMIN_*`**, **`APP_IMAGE`**, **`TELEGRAM_*`**, **`ENCRYPTION_KEY`**, опционально **`APP_DB_PASSWORD`** (иначе пароль БД = **`VPN_ADMIN_PASSWORD`**), **`GITHUB_TOKEN`** + **`GITHUB_ACTOR`** для **`docker login`** на master.

Каталог на сервере по умолчанию: **`DEPLOY_ROOT`** = `/opt/infrastructure`, приложение — **`/opt/infrastructure/app`**.

## Стек Compose

- **postgres:16-alpine** — том **`app_postgres_data`**, healthcheck **`pg_isready`**.
- **redis:7-alpine** — пароль из шаблона (сейчас совпадает с **`vpn_admin_password`** в `.env`).
- **app** — образ **`APP_IMAGE`**, зависит от healthy Postgres; порт на хосте **`127.0.0.1:${PORT:-3000}:3000`** (снаружи не слушает `0.0.0.0`). В контейнере при старте: **`prisma migrate deploy`**, затем **`node dist/main.js`**.

## Проверка после деплоя

Запрос **`GET http://127.0.0.1:3000/health`** с ретраями; допускаются **200** и **503** на время прогрева. При исчерпании ретраев выполняется **`docker compose logs --tail 200`**, затем **`fail`** с выводом логов в сообщении (удобно смотреть в логе Actions).

## Локальный запуск

См. **[`AGENT_INFRA.md`](AGENT_INFRA.md)** (WSL, **`MASTER_IP`**, inventory). Нужно задать **`APP_IMAGE`** (например тег только что собранного образа) и остальные переменные, как в workflow.
