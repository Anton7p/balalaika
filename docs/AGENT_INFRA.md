# Контекст для агента: инфраструктура и проверки

Кратко, что это за проект и как безопасно заходить на серверы для диагностики. **Не коммитьте пароли, ключи и `inventory.ini` с секретами.**

## Политика: генерация инвентаря и вспомогательная автоматизация (зафиксировано)

Сборку **`inventory.ini` на runner из секретов GitHub Actions** делаем **только средствами Ansible** — плейбук **`ansible/playbooks/ci-write-inventory.yml`** и шаблон **`ansible/playbooks/templates/inventory.ci.ini.j2`** (переменные окружения `SERVER_IP`, при режиме cluster — `INFRASTRUCTURE_IP_LIST`, опционально `INVENTORY_MODE`, `REQUIRE_NONEMPTY_NODES`, `OUTPUT_PATH`). Отдельные shell/Python-скрипты в репозитории для этого не используются. Установка пакета **Ansible** в CI через `pip` остаётся допустимой как способ поставить сам Ansible на образ runner.

## Политика HTTP к панели 3x-ui (зафиксировано)

**В этом репозитории CSRF не используется нигде и никогда** для автоматизации и описанных сценариев доступа к панели на loopback (`127.0.0.1:<webPort>`): ни заголовков вида **`X-CSRF-Token`**, ни отдельных запросов «за токеном перед записью». Допускается **только cookie-сессия** после успешного **`POST {prefix}/login`** и передача того же **`Cookie`** во всех следующих запросах (`ansible.builtin.uri` — см. `tasks/deploy/three-x-ui-inbound/panel-login-session.yml` и др., `tasks/deploy/three-x-ui-telegram-http.yml`). Новые правки не должны вводить CSRF в эти цепочки.

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
| **Deploy Panel Only** | Без сборки образа и без обновления стека бота: Ansible `playbooks/deploy-panel.yml` — 3x-ui, inbound, nginx/certbot (master из `SERVER_IP`). Секреты приложения (`TELEGRAM_BOT_TOKEN`, `GHCR_*`, …) не нужны. |

Переменные окружения для Ansible в CI задаются секретами репозитория (имена без значений).

Обязательные:  
`SERVER_IP`, `INFRASTRUCTURE_IP_LIST`, `DOMAIN_NAME`, `SSH_PRIVATE_KEY`, `VPN_ADMIN_USERNAME`, `VPN_ADMIN_PASSWORD`, `TELEGRAM_BOT_TOKEN`, `ENCRYPTION_KEY`, `GHCR_USERNAME`, `GHCR_TOKEN`.

Опциональные (VPN / панель):  
`THREE_X_UI_INBOUND_ID` — если задан, деплой только проверяет, что такой inbound уже есть на панели; если не задан, Ansible создаёт/находит inbound по remark (`THREE_X_UI_MANAGED_INBOUND_REMARK`).  
`THREE_X_UI_VPN_PORT` — TCP-порт инбаунда Xray на master (по умолчанию **8443**, не занимать порт **443** у nginx).  
`THREE_X_UI_REALITY_PRIVATE_KEY` и `THREE_X_UI_REALITY_PUBLIC_KEY` — пара Reality; если оба заданы, ключи не генерируются на сервере. Если оба пустые — генерируются один раз и сохраняются в `panel/data/.balalaika-reality.json`.  
`THREE_X_UI_MANAGED_INBOUND_REMARK` — remark инбаунда для поиска/создания (по умолчанию `balalaika-bot`).  
`TELEGRAM_BOT_ADMIN` и `TELEGRAM_ID_ADMIN` — если оба заданы, Ansible синхронизирует уведомления панели через HTTP **`POST …/panel/setting/update`** (cookie после `login`, см. `tasks/deploy/three-x-ui-telegram-http.yml`); если любой из них пустой — бот уведомлений в панели **выключается** и поля очищаются. Отдельно от токена **`TELEGRAM_BOT_TOKEN`** для приложения-бота.

Инвентарь в CI **генерируется** плейбуком **`ansible/playbooks/ci-write-inventory.yml`** из env (`SERVER_IP`; для cluster — ещё `INFRASTRUCTURE_IP_LIST`). В GitHub Actions шаг выполняется с **`working-directory: ansible`**: `ansible-playbook -i localhost, playbooks/ci-write-inventory.yml` (так подхватывается **`ansible/ansible.cfg`**). Режим по умолчанию **master**; для bootstrap и полного деплоя задаётся **`INVENTORY_MODE=cluster`**, для **Deploy Panel and Nodes** дополнительно **`REQUIRE_NONEMPTY_NODES=1`**. Локальный файл `ansible/inventory.ini` не должен попадать в git.

Дефолты образа панели, web base path, порта VPN и Reality (dest/SNI и т.д.): `ansible/playbooks/vars/three-x-ui.defaults.yml`. Авто-inbound: каталог `ansible/playbooks/tasks/deploy/three-x-ui-inbound/` (`main.yml` подключает шаги Reality, HTTP-сессию и API inbound).

**Почему в loopback-URL два раза подряд `panel`:** у 3x-ui задаётся `webBasePath` (дефолт `/panel/` — см. `x-ui setting -webBasePath`). REST API в коде панели смонтировано как `/panel/api` **внутри** этого префикса, поэтому полный путь на хосте выходит вида `http://127.0.0.1:<порт>/panel/panel/api/...`. Снаружи пользователь видит только `https://<DOMAIN>/panel/` — nginx проксирует на тот же префикс у процесса панели. Логин деплоя: POST формы на `{prefix}/login`, дальше запросы с cookie сессии (как в `three-x-ui-inbound/panel-login-session.yml` и `three-x-ui-telegram-http.yml`).

## Что хранится «в базах»

- **PostgreSQL** (стек приложения в `/opt/infrastructure/app`): данные **бота** — пользователи Telegram, подписки, биллинг, флаги уведомлений и т.д. (схема в `prisma/`). К конфигам VPN-панели это не относится.
- **Локальная БД 3x-ui** (SQLite в каталоге данных панели на томе `panel/data`, внутри контейнера `/etc/x-ui`): учётная запись администратора панели, список **inbounds**, сериализованные настройки Xray (**streamSettings** / клиенты), статистика трафика по клиентам, настройки самой панели.
- **Файлы на томе панели** (рядом с БД 3x-ui): сгенерированные Ansible ключи Reality и short id — `.balalaika-reality.json`, `.balalaika-shortid.hex` (не коммитить; бэкапить вместе с `panel/data`, если нужен восстановляемый прод).

После деплоя числовой id нужного inbound для бота попадает в `/opt/infrastructure/app/.env` как **`THREE_X_UI_INBOUND_ID`** (из созданного или найденного по remark инбаунда).

## Как зайти в панель 3x-ui (проверка UI)

1. URL в браузере: **`https://<DOMAIN_NAME>/panel/`**  
   (`DOMAIN_NAME` — тот же, что в секретах / переменных деплоя; префикс задаётся дефолтом и `x-ui setting -webBasePath`.)
2. Логин / пароль: те же, что **`VPN_ADMIN_USERNAME`** / **`VPN_ADMIN_PASSWORD`** (Ansible прокидывает их в `docker exec … x-ui setting …`).

Альтернатива для отладки (если открыт порт и файрвол): прямой доступ к порту панели на хосте (**2053** по умолчанию у 3x-ui), но для продакшена эталон — домен через nginx.

## HTTP API 3x-ui: настройки панели и Telegram (ручной вызов)

Под общим **`webBasePath`** (дефолт **`/panel/`**) у панели есть как минимум:

| Назначение | Пример пути относительно `<ORIGIN><BASE>` |
|------------|-------------------------------------------|
| Логин (cookie-сессия) | **`login`** (POST, форма **`username`** / **`password`**) |
| Снимок всех полей настроек | **`panel/setting/all`** (POST) |
| Запись всех полей | **`panel/setting/update`** (POST, JSON тело как в ответе **`setting/all`**) |
| Список inbound и др. | **`panel/api/...`** |

**`<ORIGIN>`** — на сервере обычно `http://127.0.0.1:<webPort>`; **`<BASE>`** — **`webBasePath`** без завершающего слэша в URL (как в Ansible: `/panel` при **`/panel/`** в БД).

Рабочий сценарий без секретов в примере: **`POST login`** → сохранить **`Set-Cookie`** → **`POST panel/setting/all`** с заголовком **`Cookie`** → поправить в JSON поля вроде **`tgBotEnable`**, **`tgBotToken`**, **`tgBotChatId`**, **`tgLang`** → **`POST panel/setting/update`** с тем же **`Cookie`** и полным телом (**CSRF не участвует**, см. политику выше). Так делает деплой в **`tasks/deploy/three-x-ui-telegram-http.yml`** (включает бота при непустых **`TELEGRAM_BOT_ADMIN`** и **`TELEGRAM_ID_ADMIN`**, иначе выключает и очищает поля).

У конкретной сборки **3x-ui** могут отличаться заголовки или ответы ошибок — сверяйтесь с живой панелью.

**Не коммитьте** в git токены, пароли и файлы cookie.

## Как зайти на сервер по SSH (проверка CLI)

1. Использовать ключ из секрета **`SSH_PRIVATE_KEY`** (в CI он складывается во временный `ssh-ed25519 `).
2. Либо локально: `ssh root@<IP_master>` с вашим ключом, если bootstrap уже положил `authorized_keys`.
3. Пароль из JSON в `SERVER_IP` / элементах `INFRASTRUCTURE_IP_LIST` используется только если настроен парольный вход и вы собираетесь заходить через Ansible с `ansible_password` — **не храните пароли в открытом виде в репозитории.**

### SSH из Cursor (агент / встроенный терминал)

Команды ассистента выполняются **на вашем компьютере**, в окружении Cursor. Отдельного «облачного» доступа агента к серверу нет: сессия доходит до master только если **уже работает** ваш локальный SSH (ключ в `~/.ssh` или загружен в `ssh-agent`, запись в `authorized_keys` на сервере после bootstrap).

- Адрес master берите из поля **`address`** в JSON секрета **`SERVER_IP`** (GitHub) или из локального `.env` в корне репозитория (файл в `.gitignore`) — сами значения **не коммитьте**.
- Неинтерактивная проверка входа (без запроса пароля в терминале; сработает только при ключевой аутентификации):

```bash
ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 root@<IP_master> "echo connected && hostname && uptime"
```

`-o BatchMode=yes` отключает интерактивный ввод: при отсутствии подходящего ключа команда сразу завершится с ошибкой (пароль через SSH так не ввести). При первом подключении к новому хосту можно использовать `StrictHostKeyChecking=accept-new`, чтобы один раз принять fingerprint без ручного редактирования `known_hosts`.

Дальше по тому же `ssh … root@<IP_master> "…"` гоняются любые однострочные проверки (те же `docker compose`, `curl` к `/health` на loopback — см. блок ниже).

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
- Задачи master: `ansible/playbooks/tasks/deploy/master.yml` (после синка учётки панели подключается `tasks/deploy/three-x-ui-inbound/main.yml`, затем шаблонится `.env` приложения)
- Compose панели: `ansible/playbooks/templates/three-x-ui-master-compose.yml.j2`
- Nginx: `ansible/playbooks/templates/nginx-subscription.conf.j2` (прокси `/panel/` → порт панели, `/sub/` → порт подписки **2096**)

При смене портов правьте переменные в плейбуке / окружении и согласованность с `three-x-ui.defaults.yml`.
