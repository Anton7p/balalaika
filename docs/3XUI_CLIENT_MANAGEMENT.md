# Клиенты 3x-ui: UI, подписки, автоматизация

Краткая шпаргалка по тому, **что панель умеет вручную** и **как это стыкуется с репозиторием**.

## Меню inbound (панель 3x-ui)

Типичные действия из UI (раздел клиентов / inbound):

- добавить одного или нескольких клиентов;
- скопировать клиентов из другого inbound;
- сброс трафика (одному или всем);
- экспорт ссылок и **экспорт ссылок — подписка** (subscription URL для приложений);
- удалить отключённых, экспорт подключений, клонировать, удалить.

Всё это — **ручные** операции; для бота и CI мы опираемся на **HTTP API** master, а не на SQLite и не на копипаст из UI.

## Как мы это планируем в продукте

Целевая модель выдачи, нод и failover: **[`VPN_OPERATING_MODEL.md`](VPN_OPERATING_MODEL.md)** (в т.ч. `vless://` vs подписка, master vs ноды).

## API и код приложения

- Описание REST панели: **[`PANEL_REST_API.md`](PANEL_REST_API.md)** (в т.ч. клиенты inbound, ссылки, при наличии — подписки в API v3).
- Создание/продление клиентов из бота: провайдер **`src/vpn/three-x-ui-vpn.provider.ts`**, inbound по **`VPN_PANEL_INBOUND_ID`** (см. **[`PANEL_MASTER_NODES.md`](PANEL_MASTER_NODES.md)**).

## Ansible

Inbounds создаются плейбуками **`ansible/3xui/deploy-panel.yml`** и **`ansible/3xui/deploy-nodes.yml`**; параметры per-node и локального inbound — **`ansible/3xui/defaults/main.yml`**.
