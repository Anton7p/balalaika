# Balalaika

Telegram-бот VPN на **NestJS**: подписки, выдача **`vless://`** через **3x-ui** (master + ноды), auto-failover, деплой через **Ansible** и **GitHub Actions**.

**Текущий этап:** MVP готов без реальной оплаты; идёт нагрузочное тестирование. Подробно — **[`docs/PRODUCT_STAGE.md`](docs/PRODUCT_STAGE.md)**.

## Документация

| Тема | Файл |
|------|------|
| Этап продукта (MVP) | [`docs/PRODUCT_STAGE.md`](docs/PRODUCT_STAGE.md) |
| VPN: ноды, пулы, failover | [`docs/VPN_OPERATING_MODEL.md`](docs/VPN_OPERATING_MODEL.md) |
| Roadmap (PSP, тесты, …) | [`docs/BOT_ROADMAP.md`](docs/BOT_ROADMAP.md) |
| Деплой бота | [`docs/DEPLOY_BOT.md`](docs/DEPLOY_BOT.md) |
| Инфра / SSH / WSL | [`docs/AGENT_INFRA.md`](docs/AGENT_INFRA.md) |
| Секреты GitHub | [`docs/GITHUB_SECRETS.md`](docs/GITHUB_SECRETS.md) |

## Локальная разработка

```bash
npm install
# .env в корне (не коммитить) — см. docs/AGENT_INFRA.md, src/config/env.validation.ts
npm run start:dev
```

Переменные: Postgres, Redis, `TELEGRAM_BOT_TOKEN`, `VPN_PANEL_URL`, `VPN_ADMIN_*` — см. `src/config/env.validation.ts`.

## Деплой (с машины с Ansible, обычно WSL)

```bash
bash scripts/deploy_bootstrap_then_bot.sh --build   # с нуля
bash scripts/deploy_bot.sh --build                  # только бот
bash scripts/reset_and_redeploy.sh --build        # teardown + панель + ноды + бот
bash scripts/watchdog_logs.sh                     # логи failover
```

Корневой **`.env`**: `MASTER_IP`, `NODE_IPS`, секреты — для скриптов; в git не попадает.

## Стек

- **app** — NestJS, Prisma, BullMQ, Telegraf  
- **master** — 3x-ui v3.0.2, nginx, `vpn-watchdog`  
- **ноды** — 3x-ui + Xray, inbound с `nodeId` на master  

Лицензия проекта — см. репозиторий; NestJS — MIT.
