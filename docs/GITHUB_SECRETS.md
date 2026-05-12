# Репозиторные секреты GitHub Actions

В **Settings → Secrets and variables → Actions** используем **только** перечисленные ниже имена. **Новые секреты не добавляем** — не хватает возможностей меняем код, плейбуки или процесс.

`GITHUB_TOKEN` в этот список не входит: его выдаёт GitHub самому workflow; в UI репозиторных секретов не создаём.

---

`DOMAIN_NAME` — публичный домен master (TLS, URL в конфигурации).

`ENCRYPTION_KEY` — ключ шифрования чувствительных данных приложения.

`GHCR_TOKEN` — токен для доступа к GitHub Container Registry (в паре с `GHCR_USERNAME`, если job так настроен).

`GHCR_USERNAME` — учётная запись для GHCR рядом с `GHCR_TOKEN`.

`MASTER_IP` — JSON `{"address":"…","password":"…"}`: хост master и пароль `root` для Ansible (`ci-write-inventory.yml`).

`NODE_IPS` — данные по нодам для сценариев инфраструктуры; формат задаётся плейбуком, который их читает.

`SSH_PRIVATE_KEY` — приватный ключ CI для входа на master по SSH.

`SSH_PUBLIC_KEY` — публичный ключ пары; попадает на сервер при bootstrap.

`TELEGRAM_ADMIN_ID` — Telegram user id администратора для бота приложения.

`TELEGRAM_BOT_ADMIN` — токен бота уведомлений панели 3x-ui (`tgBotToken`); не путать с `TELEGRAM_BOT_TOKEN`.

`TELEGRAM_BOT_TOKEN` — токен бота приложения (подписки и т.д.).

`VPN_ADMIN_PASSWORD` — пароль учётной записи панели 3x-ui; при деплое бота же используется как пароль Postgres приложения, если в окружении не задан отдельный `APP_DB_PASSWORD`.

`VPN_ADMIN_USERNAME` — имя пользователя панели 3x-ui.
