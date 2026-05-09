# Контекст для агента: инфраструктура и проверки

Кратко, что это за проект и как безопасно заходить на серверы для диагностики. **Не коммитьте пароли, ключи и `inventory.ini` с секретами.**

## Продукт

- Telegram-бот (NestJS) продаёт подписки и через интеграцию создаёт клиента во **встроенной панели [3x-ui](https://github.com/MHSanaei/3x-ui)** на master-хосте.
- VPN-слой в коде: адаптер `ThreeXUiVpnProvider` (`src/vpn/three-x-ui-vpn.provider.ts`), контракт `VpnProvider`.
- Бот на проде крутится в Docker на master (`ansible/playbooks/templates/app-compose.yml.j2`, каталог деплоя по умолчанию `/opt/infrastructure/app`).

## Топология

- **`master`** в Ansible inventory — основной сервер: 3x-ui (Docker `network_mode: host`), nginx, certbot, стек приложения (postgres/redis/app через compose).
- Группа **`nodes`** в плейбуке деплоя не поднимает отдельный VPN-стек; узлы могут быть в inventory для SSH/bootstrap, но панель и выдача ключей — с master.

## Деплой через GitHub Actions

Репозиторий: workflow по ручному запуску (`workflow_dispatch`).

| Workflow | Назначение |
|----------|------------|
| **Bootstrap Infrastructure** | BBR, Docker, SSH-ключ, hardening, на master — nginx/certbot (первичная подготовка хостов). |
| **Deploy Panel and Nodes** | Сборка образа бота в GHCR, Ansible `playbooks/deploy.yml`: 3x-ui + приложение + nginx под домен. |

Переменные окружения для Ansible в CI задаются секретами репозитория (имена без значений).

Обязательные:  
`SERVER_IP`, `INFRASTRUCTURE_IP_LIST`, `DOMAIN_NAME`, `SSH_PRIVATE_KEY`, `VPN_ADMIN_USERNAME`, `VPN_ADMIN_PASSWORD`, `TELEGRAM_BOT_TOKEN`, `ENCRYPTION_KEY`, `GHCR_USERNAME`, `GHCR_TOKEN`.

Опциональные (VPN / панель):  
`THREE_X_UI_INBOUND_ID` — если задан и включена автоматизация, деплой только проверяет, что такой inbound есть на панели; если автоматизацию выключили (`THREE_X_UI_MANAGE_INBOUND`), секрет **обязателен**.  
`THREE_X_UI_MANAGE_INBOUND` — `false` / `0` / `no` отключает создание inbound через API (только ручной id из секрета). По умолчанию автоматизация **включена**.  
`THREE_X_UI_VPN_PORT` — TCP-порт инбаунда Xray на master (по умолчанию **8443**, не занимать порт **443** у nginx).  
`THREE_X_UI_REALITY_PRIVATE_KEY` и `THREE_X_UI_REALITY_PUBLIC_KEY` — пара Reality; если оба заданы, ключи не генерируются на сервере. Если оба пустые — генерируются один раз и сохраняются в `panel/data/.balalaika-reality.json`.  
`THREE_X_UI_MANAGED_INBOUND_REMARK` — remark инбаунда для поиска/создания (по умолчанию `balalaika-bot`).

Инвентарь в CI **генерируется скриптом** из `SERVER_IP` и `INFRASTRUCTURE_IP_LIST` (см. шаги workflow). Локальный файл `ansible/inventory.ini` не должен попадать в git.

Дефолты образа панели, web base path, порта VPN и Reality (dest/SNI и т.д.): `ansible/playbooks/vars/three-x-ui.defaults.yml`. Авто-inbound: `ansible/playbooks/tasks/deploy/three-x-ui-inbound.yml` (HTTP к панели на `127.0.0.1` через `ansible.builtin.uri`).

## Что хранится «в базах»

- **PostgreSQL** (стек приложения в `/opt/infrastructure/app`): данные **бота** — пользователи Telegram, подписки, биллинг, флаги уведомлений и т.д. (схема в `prisma/`). К конфигам VPN-панели это не относится.
- **Локальная БД 3x-ui** (SQLite в каталоге данных панели на томе `panel/data`, внутри контейнера `/etc/x-ui`): учётная запись администратора панели, список **inbounds**, сериализованные настройки Xray (**streamSettings** / клиенты), статистика трафика по клиентам, настройки самой панели.
- **Файлы на томе панели** (рядом с БД 3x-ui): сгенерированные Ansible ключи Reality и short id — `.balalaika-reality.json`, `.balalaika-shortid.hex` (не коммитить; бэкапить вместе с `panel/data`, если нужен восстановляемый прод).

После деплоя числовой **`THREE_X_UI_INBOUND_ID`** для бота попадает в `/opt/infrastructure/app/.env` автоматически, если включена автоматизация inbound.

## Как зайти в панель 3x-ui (проверка UI)

1. URL в браузере: **`https://<DOMAIN_NAME>/panel/`**  
   (`DOMAIN_NAME` — тот же, что в секретах / переменных деплоя; префикс задаётся дефолтом и `x-ui setting -webBasePath`.)
2. Логин / пароль: те же, что **`VPN_ADMIN_USERNAME`** / **`VPN_ADMIN_PASSWORD`** (Ansible прокидывает их в `docker exec … x-ui setting …`).

Альтернатива для отладки (если открыт порт и файрвол): прямой доступ к порту панели на хосте (**2053** по умолчанию у 3x-ui), но для продакшена эталон — домен через nginx.

## Как зайти на сервер по SSH (проверка CLI)

1. Использовать ключ из секрета **`SSH_PRIVATE_KEY`** (в CI он складывается во временный `id_rsa`).
2. Либо локально: `ssh root@<IP_master>` с вашим ключом, если bootstrap уже положил `authorized_keys`.
3. Пароль из JSON в `SERVER_IP` / элементах `INFRASTRUCTURE_IP_LIST` используется только если настроен парольный вход и вы собираетесь заходить через Ansible с `ansible_password` — **не храните пароли в открытом виде в репозитории.**

Проверки на master после деплоя:

```bash
docker ps --filter name=3x-ui
docker compose -f /opt/infrastructure/panel/docker-compose.yml ps
docker compose -f /opt/infrastructure/app/docker-compose.yml ps
curl -fsS http://127.0.0.1:3000/health || true
```

Снаружи (TLS): `https://<DOMAIN_NAME>/health` — должен отдавать 200 (заглушка nginx для мониторинга).

## Переменные приложения (VPN)

Обязательные для бота (см. `src/config/env.validation.ts`):  
`VPN_PANEL_URL` (обычно `https://<DOMAIN_NAME>`), `VPN_ADMIN_USERNAME`, `VPN_ADMIN_PASSWORD`, `DOMAIN_NAME`, **`THREE_X_UI_INBOUND_ID`** (числовой id inbound в панели, под который создаются клиенты — при авто-деплое подставляется Ansible в `.env`).  
Опционально: `THREE_X_UI_WEB_BASE_PATH` (если не задан — в коде fallback `/panel/`).

## Где смотреть код деплоя

- Плейбук: `ansible/playbooks/deploy.yml`
- Задачи master: `ansible/playbooks/tasks/deploy/master.yml` (после синка учётки панели подключается `tasks/deploy/three-x-ui-inbound.yml`, затем шаблонится `.env` приложения)
- Compose панели: `ansible/playbooks/templates/three-x-ui-master-compose.yml.j2`
- Nginx: `ansible/playbooks/templates/nginx-subscription.conf.j2` (прокси `/panel/` → порт панели, `/sub/` → порт подписки **2096**)

При смене портов правьте переменные в плейбуке / окружении и согласованность с `three-x-ui.defaults.yml`.
