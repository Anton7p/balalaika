# Этап продукта (зафиксирован)

**Статус:** MVP **готов к эксплуатации и нагрузочному тестированию** без реальной оплаты.  
**Дата фиксации:** 2026-05-17.

Следующий крупный этап — **PSP и биллинг** (см. **[`BOT_ROADMAP.md`](BOT_ROADMAP.md)**, этап 1).

---

## Что работает (проверено на стенде)

| Область | Состояние |
|---------|-----------|
| Инфра | Bootstrap master, 3x-ui **v3.0.2** на master и нодах, Ansible + скрипты `scripts/` |
| VPN | Выдача и продление **`vless://` на ноду**, очередь **`NODE_IPS`**, лимит **`VPN_INBOUND_CLIENT_LIMIT`** (дефолт **200**) |
| Отказоустойчивость | **`vpn-watchdog`** → `copyClients` → hook бота, рассылка ключей, логи `scripts/watchdog_logs.sh` |
| Бот | Telegram: меню, покупка (заглушка оплаты), ключи, напоминания, базовый **`/admin`** |
| Данные | Postgres (users, subscriptions, audit), Redis (очередь рабочих inbound после failover) |
| Деплой | GHCR + **`deploy-bot.yml`**, локально **`scripts/reset_and_redeploy.sh`**, **`DEPLOY_BOT.md`** |

Смоук **ротации по лимиту** (1 клиент на inbound): временно **`VPN_INBOUND_CLIENT_LIMIT=1`** в env при деплое; для прода и нагрузки — **200** (дефолт в `ansible/bot/deploy-app.yml`, workflow, `LoadBalancerService`).

---

## Сознательно не в MVP

- Реальный **PSP** (сейчас оплата через заглушку — успех сразу).
- Таблицы **`Order` / `Payment`**, webhook провайдера.
- **Автоотзыв** клиента в панели по **`expiresAt`** (есть уведомления, нет отключения в Xray).
- Unit/integration-тесты в CI, расширенная админка, промокоды, тарифы в БД.

---

## Сейчас: нагрузочное тестирование

1. Нагрузка на **выдачу** (много новых подписок, заполнение inbound до лимита, переход на следующую ноду).
2. Сценарий **failover** (падение рабочей ноды, проверка ключей и Postgres) — runbook §6 **[`VPN_OPERATING_MODEL.md`](VPN_OPERATING_MODEL.md)**.
3. Мониторинг: **`scripts/watchdog_logs.sh`**, **`scripts/check-bot-stack-remote.sh`**, панель **Nodes**.

После стабилизации нагрузки — **этап 1 roadmap** (PSP).

---

## Связанные документы

| Документ | Назначение |
|----------|------------|
| [`VPN_OPERATING_MODEL.md`](VPN_OPERATING_MODEL.md) | Канон master / ноды / пулы / failover |
| [`BOT_ROADMAP.md`](BOT_ROADMAP.md) | План 4–6 недель после MVP |
| [`DEPLOY_BOT.md`](DEPLOY_BOT.md) | Деплой приложения |
| [`AGENT_INFRA.md`](AGENT_INFRA.md) | SSH, WSL, inventory |
| [`GITHUB_SECRETS.md`](GITHUB_SECRETS.md) | Секреты CI |
