# Панель и ноды (что ставим)

Ставим **3x-ui** репозитория **[MHSanaei/3x-ui](https://github.com/MHSanaei/3x-ui)** ветки/тега **`v3.0.1`** (коммит `8f3202f` — ориентир при сверке с образом или сборкой).

## Роли

| Роль | Как задаём в репозитории | Смысл |
|------|---------------------------|--------|
| **Master** — центральная панель | Секрет **`MASTER_IP`**: JSON `{"address","password"}` для Ansible и SSH на хост с панелью и основным Xray | Один «главный» инстанс: UI, API, учёт inbounds/клиентов. |
| **Ноды** — удалённые панели под master | Секрет **`NODE_IPS`**: данные по нодам для сценариев инфраструктуры (формат задаётся плейбуком, который их читает) | В API панели v3 — раздел **Nodes** (`/panel/api/nodes/*`): регистрация удалённых 3x-ui, проба, история метрик. |

Подробнее по секретам: [`GITHUB_SECRETS.md`](GITHUB_SECRETS.md). Подключение к master по SSH: [`AGENT_INFRA.md`](AGENT_INFRA.md). REST панели: [`PANEL_REST_API.md`](PANEL_REST_API.md).

**Автоматизация:** GitHub Actions workflow **[`deploy-3xui.yml`](../.github/workflows/deploy-3xui.yml)** — вручную, параметр **target**: `panel` (только master), `nodes` (только ноды, без SSH на master), `all` (сначала панель, затем ноды). Плейбуки и заглушки: каталог **`ansible/3xui/`** (`deploy-panel.yml`, `deploy-nodes.yml`, `tasks/panel/`, `tasks/nodes/`). Пошаговый план установки панели на master: **[`PANEL_INSTALL_MASTER.md`](PANEL_INSTALL_MASTER.md)**.

## Кратко, что даёт **v3.0.1** для нас

- **Встроенная документация API** в панели — не нужно искать только внешние описания; актуально рядом с [`PANEL_REST_API.md`](PANEL_REST_API.md).
- **Inbounds:** эндпоинты **sub / client links** (`getSubLinks`, `getClientLinks` и т.п.) — проще выдавать ссылки и подписки из автоматизации.
- **Установка:** опция **пропуска проверки SSL** — удобно за reverse proxy или SSH-туннелем.
- **Xray:** TCP probe для outbounds, «Test All», разбор времени; правки **balancer / observatory**, **Nord**-список с нагрузкой и ошибками API.
- **UI:** тёмная тема и новый логин, пины в сайдбаре (в т.ч. **Logout**), смена темы в один цикл, bulk-select клиентов, QR через компонент ant-design-vue.

Итого: **master** описываем **`MASTER_IP`**, кластер **нод** — **`NODE_IPS`**; версия панели целим в **v3.0.1**, чтобы совпадать с встроенным API Docs и перечисленными возможностями.
