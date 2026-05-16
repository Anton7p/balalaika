# Клиенты 3x-ui: UI, API и правила репозитория

## Канон (продукт)

Все правила выдачи, пулов нод, failover и **смены приёма новых (`VPN_PANEL_INBOUND_ID`)**: **[`VPN_OPERATING_MODEL.md`](VPN_OPERATING_MODEL.md)** (разделы **3.1**, **4**).

Кратко: пользователю — **`vless://`** на **эндпоинт ноды**; master — учёт и API для бота; пулы **рабочих** и **запасных** нод; при аварии — **вариант A** (API `copyClients` / аналог, смена **`VPN_PANEL_INBOUND_ID`**, рассылка новых ссылок).

## Что умеет UI панели (ручные операции)

В меню inbound (клиенты): добавить одного или нескольких; скопировать клиентов из другого inbound; сброс трафика; экспорт ссылок и **подписка** (`/sub/…`); удалить отключённых; экспорт подключений; клонировать; удалить.

Для бота и CI используем **REST API master**, а не ручной копипаст из UI. Справочник эндпоинтов: **[`PANEL_REST_API.md`](PANEL_REST_API.md)**.

## Код приложения

- Провайдер: **`src/vpn/three-x-ui-vpn.provider.ts`**; рабочие inbound и лимит: **`VPN_WORKING_INBOUND_IDS`**, **`VPN_INBOUND_CLIENT_LIMIT`** (§7 **[`VPN_OPERATING_MODEL.md`](VPN_OPERATING_MODEL.md)**). После `addClient` / `updateClient` — **`getClientLinks`**, первая **`vless://`**.

## Ansible

**`ansible/3xui/`** — **`deploy-panel.yml`**, **`deploy-nodes.yml`**; параметры inbound’ов — **`ansible/3xui/defaults/main.yml`**.
