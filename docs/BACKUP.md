# Ежедневные бэкапы в Telegram админу

Два источника данных:

| Источник | Как отправляется | Файл |
|----------|------------------|------|
| **Панель 3x-ui** | Встроенный планировщик панели (`tgBotBackup`, `@daily`) | SQLite `x-ui.db` |
| **Приложение (бот)** | Cron на master + скрипт репозитория | `pg_dump -Fc` → `.dump.gz` |

Оба приходят в чат **`TELEGRAM_ADMIN_ID`**. Восстановление: [`RESTORE.md`](RESTORE.md).

---

## Что нужно в GitHub Secrets

| Секрет | Зачем |
|--------|--------|
| **`TELEGRAM_ADMIN_ID`** | Chat id админа (куда слать файлы) |
| **`TELEGRAM_BOT_ADMIN`** | Токен **отдельного** бота для уведомлений панели 3x-ui (рекомендуется) |
| **`TELEGRAM_BOT_TOKEN`** | Бот приложения; используется для бэкапа Postgres, если `TELEGRAM_BOT_ADMIN` пуст |

Создайте второго бота в @BotFather для панели (`TELEGRAM_BOT_ADMIN`) или используйте один токен для всего (хуже с точки зрения разделения ролей).

Админ должен **написать `/start`** боту, который шлёт файлы (иначе Telegram не доставит документ).

**Бот в панели «не работает»:** проверка токена и сети с master:

```bash
bash scripts/test-telegram-bot.sh 'ВАШ_ТОКЕН' 'ВАШ_TELEGRAM_ADMIN_ID'
```

С ПК `getMe` OK, с master FAIL — панель не достучится до Telegram (фаервол/РФ), нужен прокси в Settings → Telegram.

---

## 1. Бэкап панели (3x-ui)

Уже включается Ansible при деплое панели, если заданы **`TELEGRAM_BOT_ADMIN`** и **`TELEGRAM_ADMIN_ID`**:

- `tgBotEnable: true`
- `tgBotBackup: true`
- `tgRunTime: "@daily"` (по умолчанию в [`ansible/3xui/defaults/main.yml`](../ansible/3xui/defaults/main.yml))

**Деплой:** Actions → **Deploy 3x-ui** → `panel` или `all` (нужны секреты `TELEGRAM_BOT_ADMIN`, `TELEGRAM_ADMIN_ID` в workflow — уже в [`.github/workflows/deploy-3xui.yml`](../.github/workflows/deploy-3xui.yml)).

Проверка вручную (после входа в панель): API `GET /panel/api/backuptotgbot` — см. [`PANEL_REST_API.md`](PANEL_REST_API.md).

Расписание меняется в UI панели (Settings → Telegram) или переменной **`xui_tg_run_time`** при деплое.

---

## 2. Бэкап Postgres приложения

Скрипт на master: [`scripts/backup-daily-to-telegram-remote.sh`](../scripts/backup-daily-to-telegram-remote.sh).

**Установка cron** (один раз или при каждом Deploy Bot):

```bash
# автоматически вместе с Deploy Bot (Ansible)
# или отдельно:
bash scripts/install_daily_backup_cron.sh
```

По умолчанию cron: **`30 3 * * *`** (03:30 каждый день). Переопределение:

```bash
export BACKUP_CRON="0 4 * * *"   # 04:00
bash scripts/install_daily_backup_cron.sh
```

**Проверка сразу:**

```bash
bash scripts/run_daily_backup.sh
```

В Telegram должны прийти сообщения и файл `app postgres … .dump.gz`.

Лог на master: `/var/log/vpnbox-backup.log`.

---

## Два бота или один

| Конфигурация | Панель | Postgres бота |
|--------------|--------|----------------|
| Есть **`TELEGRAM_BOT_ADMIN`** | 3x-ui → admin bot | Cron → тот же admin bot |
| Только **`TELEGRAM_BOT_TOKEN`** | Нет авто-бэкапа панели* | Cron → bot приложения; в cron включается копия `x-ui.db` (`BACKUP_INCLUDE_PANEL=true`) |

\*Чтобы панель тоже уходила в TG — задайте `TELEGRAM_BOT_ADMIN` и снова **Deploy 3x-ui (panel)**.

Чтобы **не дублировать** файл панели (3x-ui + cron), при наличии `TELEGRAM_BOT_ADMIN` в cron по умолчанию **`BACKUP_INCLUDE_PANEL=false`**. Принудительно оба из cron:

```bash
export BACKUP_INCLUDE_PANEL=true
bash scripts/install_daily_backup_cron.sh
```

---

## CI: полная настройка с нуля

1. Секреты: `TELEGRAM_ADMIN_ID`, `TELEGRAM_BOT_ADMIN`, `TELEGRAM_BOT_TOKEN`, остальные по [`GITHUB_SECRETS.md`](GITHUB_SECRETS.md).
2. **Deploy 3x-ui** → `panel` (или `all`) — Telegram панели + `@daily` бэкап SQLite.
3. **Deploy Bot** — поднимает app и **ставит cron** Postgres (если есть `TELEGRAM_ADMIN_ID`).
4. `bash scripts/run_daily_backup.sh` — тест Postgres.
5. Дождаться следующего дня или проверить панель через UI / `backuptotgbot`.

---

## Ограничения

- Лимит Telegram на файл — **~50 МБ**. При превышении в чат уйдёт предупреждение; файл останется в `/opt/infrastructure/backup/work/` (хранение 7 дней).
- Бэкап панели через cron-скрипт на ~секунду останавливает контейнер `x-ui` (только если `BACKUP_INCLUDE_PANEL=true`).
- Redis и тома Docker **не** входят в дамп — только Postgres приложения и (опционально) SQLite панели.

---

## Файлы на master

| Путь | Назначение |
|------|------------|
| `/opt/infrastructure/backup/backup-daily-to-telegram.sh` | Запуск бэкапа приложения |
| `/opt/infrastructure/backup/telegram.env` | Токен, chat id, флаги |
| `/opt/infrastructure/backup/work/` | Временные `.gz` перед отправкой |
| `/var/log/vpnbox-backup.log` | Лог cron |

---

## Связанные документы

- [`RESTORE.md`](RESTORE.md) — восстановление из этих файлов  
- [`BOTFATHER_SETUP.md`](../BOTFATHER_SETUP.md) — `TELEGRAM_ADMIN_ID`, боты  
- [`PANEL_MASTER_NODES.md`](PANEL_MASTER_NODES.md) — панель и Telegram
