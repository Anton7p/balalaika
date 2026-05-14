# Панель и ноды (что ставим)

Ставим **3x-ui** репозитория **[MHSanaei/3x-ui](https://github.com/MHSanaei/3x-ui)** ветки/тега **`v3.0.2`** (коммит `e7035b5` — ориентир при сверке с образом или сборкой).

## Роли

| Роль | Как задаём в репозитории | Смысл |
|------|---------------------------|--------|
| **Master** — центральная панель | Секрет **`MASTER_IP`**: JSON `{"address","password"}` для Ansible и SSH на хост с панелью и основным Xray | Один «главный» инстанс: UI, API, учёт inbounds/клиентов. |
| **Ноды** — удалённые панели под master | Секрет **`NODE_IPS`**: данные по нодам для сценариев инфраструктуры (формат задаётся плейбуком, который их читает) | В API панели v3 — раздел **Nodes** (`/panel/api/nodes/*`): регистрация удалённых 3x-ui, проба, история метрик. |

Подробнее по секретам: [`GITHUB_SECRETS.md`](GITHUB_SECRETS.md). Подключение к master по SSH: [`AGENT_INFRA.md`](AGENT_INFRA.md). REST панели: [`PANEL_REST_API.md`](PANEL_REST_API.md).

**Автоматизация:** GitHub Actions workflow **[`deploy-3xui.yml`](../.github/workflows/deploy-3xui.yml)** — вручную, параметр **target**: `panel` (только master), `nodes` (только ноды, без SSH на master), `all` (сначала панель, затем ноды). Реализация: каталог **`ansible/3xui/`** (`deploy-panel.yml`, `deploy-nodes.yml`, `tasks/panel/`, `tasks/nodes/`, общий **`tasks/include-panel-ui-session-bearer.yml`**). Пошаговое описание установки панели на master: **[`PANEL_INSTALL_MASTER.md`](PANEL_INSTALL_MASTER.md)**.

При регистрации ноды на master в API передаётся **`basePath`**: по умолчанию **`xui_node_panel_base_path`** (= **`xui_web_base_path`**, обычно **`/panel/`**), чтобы URL пробы master совпадал с **`webBasePath`** на ноде. Переопределите в **`ansible/3xui/defaults/main.yml`** или через `-e`, если на ноде другой base path.

## Один inbound на ноду (Ansible)

По умолчанию в **`ansible/3xui/defaults/main.yml`**: **`xui_create_per_node_inbounds: true`**. После регистрации нод на master плейбук **`deploy-nodes.yml`** создаёт на **центральной панели** отдельный VLESS+REALITY inbound с полем **`nodeId`** (трафик на Xray этой ноды). **Remark** вида **`{{ xui_per_node_inbound_remark_prefix }}-203-0-113-10`** (IP с дефисами), чтобы в списке было видно, какая нода. Порты на панели **уникальны глобально**: назначаются как **`xui_per_node_inbound_port_base`** (по умолчанию **9443**) + порядковый индекс ноды после сортировки имён в **`[nodes]`**; на самой ноде в UFW открывается соответствующий TCP-порт.

- **`xui_create_default_local_inbound`** (по умолчанию **true**) — старый одиночный inbound на master (порт **`xui_inbound_port`**, remark **`xui_inbound_remark`**). Если весь пользовательский трафик только через ноды, поставьте **`false`** (через `-e` или правку defaults), чтобы не плодить лишний локальный inbound.
- Приложение бота по-прежнему шлёт клиентов в **один** inbound; задайте его id в окружении **`VPN_PANEL_INBOUND_ID`** (см. комментарий в **`src/vpn/three-x-ui-vpn.provider.ts`**). Роутинг по нескольким inbound из бота пока не автоматизирован.

Подробнее про отказ ноды, ручное переключение и ограничения: **[`VPN_NODES_AND_FAILOVER.md`](VPN_NODES_AND_FAILOVER.md)**.

## Кратко, что даёт **v3.0.x** для нас

- **Встроенная документация API** в панели — не нужно искать только внешние описания; актуально рядом с [`PANEL_REST_API.md`](PANEL_REST_API.md).
- **Inbounds:** эндпоинты **sub / client links** (`getSubLinks`, `getClientLinks` и т.п.) — проще выдавать ссылки и подписки из автоматизации.
- **Установка:** опция **пропуска проверки SSL** — удобно за reverse proxy или SSH-туннелем.
- **Xray:** TCP probe для outbounds, «Test All», разбор времени; правки **balancer / observatory**, **Nord**-список с нагрузкой и ошибками API.
- **UI:** тёмная тема и новый логин, пины в сайдбаре (в т.ч. **Logout**), смена темы в один цикл, bulk-select клиентов, QR через компонент ant-design-vue.

Итого: **master** описываем **`MASTER_IP`**, кластер **нод** — **`NODE_IPS`**; версия панели целим в **v3.0.2** (пин образа в **`ansible/3xui/defaults/main.yml`**), чтобы совпадать с встроенным API Docs и перечисленными возможностями.
