# Ноды, inbound с `nodeId`, пулы и отказоустойчивость

Краткий документ по связке **master ↔ ноды ↔ бот**. **Канонические правила** (пулы рабочих/запасных, `vless://`, failover, **смена `VPN_PANEL_INBOUND_ID`**, тестовые пороги по числу клиентов): **[`VPN_OPERATING_MODEL.md`](VPN_OPERATING_MODEL.md)**.

Ansible и версии: **[`PANEL_MASTER_NODES.md`](PANEL_MASTER_NODES.md)**, **[`PANEL_INSTALL_MASTER.md`](PANEL_INSTALL_MASTER.md)**. REST: **[`PANEL_REST_API.md`](PANEL_REST_API.md)**.

---

## Архитектура

- На **master** и на каждой **ноде** — панель **3x-ui** в Docker (образ **`v3.0.2`**). Ноды регистрируются на master (**Nodes**, `/panel/api/nodes/*`).
- На master для каждой ноды из инвентаря Ansible создаёт **отдельный VLESS+REALITY inbound** с **`nodeId`** (трафик обрабатывает **Xray на ноде**). Remark и порты — см. **`ansible/3xui/defaults/main.yml`** (`xui_per_node_inbound_*`, UFW на ноде).

---

## Пулы и бот

- **Рабочие ноды** — те, через чьи inbound’ы сейчас идёт (или планируется) прод; **запасные** — подняты и готовы, без массы клиентов до переключения. Пары **1:1 не обязательны**: запасной пул **общий**.
- **Новые** клиенты: первый inbound из **`VPN_WORKING_INBOUND_IDS`** с числом клиентов **&lt; `VPN_INBOUND_CLIENT_LIMIT`** (`src/vpn/load-balancer.service.ts`). **Продление** — inbound из **`subscriptions.panel_inbound_id`**.
- Статусы рабочих / запасных и два сценария (лимит vs авария): **[`VPN_OPERATING_MODEL.md`](VPN_OPERATING_MODEL.md)** §3.2–3.3.
- Автоматического **failover** в коде **нет**; процедура — §6 канона (`copyClients`, рассылка **`vless://`**).

---

## Если нода «Offline» в панели

Чаще всего: на master в записи ноды **устаревший API token** или неверный **`basePath`**. См. **[`PANEL_MASTER_NODES.md` — «Нода в UI показывает Offline»](PANEL_MASTER_NODES.md#нода-в-ui-показывает-offline)**.

---

## Что нужно для автоматизации failover в коде

Отдельная разработка: здоровье нод, выбор запасной из пула, вызов API копирования клиентов, обновление конфига бота, очередь рассылки **`vless://`**. До этого момента — **ручной runbook** в **[`VPN_OPERATING_MODEL.md`](VPN_OPERATING_MODEL.md)**.

---

## Переменные Ansible (напоминание)

| Переменная | Смысл |
|------------|--------|
| `xui_create_per_node_inbounds` | Inbound на ноду с `nodeId`. |
| `xui_per_node_inbound_remark_prefix` | Префикс remark. |
| `xui_per_node_inbound_port_base` | Базовый порт; далее +1 по нодам. |
| `xui_create_default_local_inbound` | Локальный inbound на master (часто выключают, если весь трафик только с нод). |
