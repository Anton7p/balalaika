# Панель и ноды (что ставим)

Ставим **3x-ui** репозитория **[MHSanaei/3x-ui](https://github.com/MHSanaei/3x-ui)** тега **`v3.0.1`** (пин в **`ansible/3xui/defaults/main.yml`**). Язык панели по умолчанию **ru-RU** (`xui_panel_tg_lang`, nginx `Accept-Language`).

## Роли

| Роль | Как задаём в репозитории | Смысл |
|------|---------------------------|--------|
| **Master** — центральная панель | Секрет **`MASTER_IP`**: JSON `{"address","password"}` для Ansible и SSH на хост с панелью и основным Xray | Один «главный» инстанс: UI, API, учёт inbounds/клиентов. |
| **Ноды** — удалённые панели под master | Секрет **`NODE_IPS`**: данные по нодам для сценариев инфраструктуры (формат задаётся плейбуком, который их читает) | В API панели v3 — раздел **Nodes** (`/panel/api/nodes/*`): регистрация удалённых 3x-ui, проба, история метрик. |

Подробнее по секретам: [`GITHUB_SECRETS.md`](GITHUB_SECRETS.md). Подключение к master по SSH: [`AGENT_INFRA.md`](AGENT_INFRA.md). REST панели: [`PANEL_REST_API.md`](PANEL_REST_API.md).

**Продуктовая модель (пулы нод, `vless://`, failover):** единый источник правил — **[`VPN_OPERATING_MODEL.md`](VPN_OPERATING_MODEL.md)**. Инвентарь **`NODE_IPS`** может включать и **рабочие**, и **запасные** ноды; кто в каком пуле — ведётся **операционно** (таблица id inbound / id ноды / IP), не обязательно пара 1:1.

**Автоматизация:** GitHub Actions workflow **[`deploy-3xui.yml`](../.github/workflows/deploy-3xui.yml)** — вручную, параметр **target**: `panel` (только master), `nodes` (только ноды, без SSH на master), `all` (сначала панель, затем ноды). Реализация: каталог **`ansible/3xui/`** (`deploy-panel.yml`, `deploy-nodes.yml`, `tasks/panel/`, `tasks/nodes/`, общий **`tasks/include-panel-ui-session-bearer.yml`**). Пошаговое описание установки панели на master: **[`PANEL_INSTALL_MASTER.md`](PANEL_INSTALL_MASTER.md)**.

При регистрации ноды на master в API передаётся **`basePath`**: по умолчанию **`xui_node_panel_base_path`** (= **`xui_web_base_path`**, обычно **`/panel/`**), чтобы URL пробы master совпадал с **`webBasePath`** на ноде. Переопределите в **`ansible/3xui/defaults/main.yml`** или через `-e`, если на ноде другой base path.

## Нода в UI показывает Offline

В **3x-ui v3** к **`/panel/api/*`** без валидной сессии или **Bearer** панель часто отвечает **HTTP 404** (не 401). Если контейнер на ноде **Up** и веб **`/panel/`** открывается, а на центральной панели нода **Offline**, чаще всего на master в записи ноды **устаревший API token** относительно самой ноды, либо неверный **`basePath`** относительно **`webBasePath`** на ноде (см. абзац про **`basePath`** выше).

**Что сделать:** снова прогнать **`ansible/3xui/deploy-nodes.yml`** или **`scripts/deploy_3xui_nodes.sh`**, либо вручную синхронизировать **API Token** и **`basePath`** в карточке ноды на master с настройками на ноде.

## Один inbound на ноду (Ansible)

По умолчанию в **`ansible/3xui/defaults/main.yml`**: **`xui_create_per_node_inbounds: true`**. После регистрации нод на master плейбук **`deploy-nodes.yml`** создаёт на **центральной панели** отдельный VLESS+REALITY inbound с полем **`nodeId`** (трафик на Xray этой ноды). **Remark** вида **`{{ xui_per_node_inbound_remark_prefix }}-203-0-113-10`** (IP с дефисами), чтобы в списке было видно, какая нода. Порты на панели **уникальны глобально**: назначаются как **`xui_per_node_inbound_port_base`** (по умолчанию **9443**) + порядковый индекс ноды после сортировки имён в **`[nodes]`**; на самой ноде в UFW открывается соответствующий TCP-порт.

- **`xui_create_default_local_inbound`** (по умолчанию **true**) — старый одиночный inbound на master (порт **`xui_inbound_port`**, remark **`xui_inbound_remark`**). Если весь пользовательский трафик только через ноды, поставьте **`false`** (через `-e` или правку defaults), чтобы не плодить лишний локальный inbound.
- Бот: список рабочих inbound **`VPN_WORKING_INBOUND_IDS`**, лимит **`VPN_INBOUND_CLIENT_LIMIT`**, выбор и CSRF — **`src/vpn/load-balancer.service.ts`**, **`src/vpn/three-x-ui-vpn.provider.ts`**. Запасные ноды и failover — вручную, **[`VPN_OPERATING_MODEL.md`](VPN_OPERATING_MODEL.md)** §3.2–3.3, §6.

Подробнее про отказ ноды, ручное переключение и ограничения: **[`VPN_NODES_AND_FAILOVER.md`](VPN_NODES_AND_FAILOVER.md)**. Восстановление SQLite панели после сноса: **[`RESTORE.md`](RESTORE.md)**.

## Кратко, что даёт **v3.0.x** для нас

- **Встроенная документация API** в панели — не нужно искать только внешние описания; актуально рядом с [`PANEL_REST_API.md`](PANEL_REST_API.md).
- **Inbounds:** эндпоинты **sub / client links** (`getSubLinks`, `getClientLinks` и т.п.) — проще выдавать ссылки и подписки из автоматизации.
- **Установка:** опция **пропуска проверки SSL** — удобно за reverse proxy или SSH-туннелем.
- **Xray:** TCP probe для outbounds, «Test All», разбор времени; правки **balancer / observatory**, **Nord**-список с нагрузкой и ошибками API.
- **UI:** тёмная тема и новый логин, пины в сайдбаре (в т.ч. **Logout**), смена темы в один цикл, bulk-select клиентов, QR через компонент ant-design-vue.

Итого: **master** описываем **`MASTER_IP`**, кластер **нод** — **`NODE_IPS`**; версия панели целим в **v3.0.2** (пин образа в **`ansible/3xui/defaults/main.yml`**), чтобы совпадать с встроенным API Docs и перечисленными возможностями.
