# Контекст для агента: подключение к серверу

## SSH на master

- Пользователь: **`root`**.
- Секрет / переменная **`MASTER_IP`** — **всегда JSON-объект** с обязательными непустыми полями **`address`** (хост или IPv4 после нормализации плейбком) и **`password`** (root для `ansible_password`). Пример: `{"address":"203.0.113.10","password":"…"}`. В GitHub Actions это репозиторный секрет **`MASTER_IP`**. Локально для **`ci-write-inventory.yml`** задайте ту же переменную окружения **`MASTER_IP`**. Для SSH в терминале — **`root@<IP>`** или **`.env`** в корне (не в git).
- На сервере в **`authorized_keys`** должен быть ваш **публичный** ключ пары **`ssh-ed25519`** (как секрет **`SSH_PRIVATE_KEY`** в CI).

Команды агента Cursor выполняются **на вашем ПК**; до сервера «доходит» только ваш реально работающий SSH.

**Проверка (bash):**

```bash
ssh -i ~/.ssh/id_ed25519 -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 root@<IP_master> "echo OK && hostname"
```

**Проверка (Windows PowerShell), ключ по умолчанию:**

```powershell
ssh -i $env:USERPROFILE\.ssh\id_ed25519 -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 root@<IP_master> "echo OK && hostname"
```

Интерактивно: **`ssh -i … root@<IP_master>`**.

- Секреты и **`inventory.ini`** с паролями **не коммитить**.

Закрытый набор имён секретов GitHub: **[`GITHUB_SECRETS.md`](GITHUB_SECRETS.md)**. REST API панели: **[`PANEL_REST_API.md`](PANEL_REST_API.md)**. Версия панели, master и ноды: **[`PANEL_MASTER_NODES.md`](PANEL_MASTER_NODES.md)**. Установка панели на master: **[`PANEL_INSTALL_MASTER.md`](PANEL_INSTALL_MASTER.md)**. Порты и hardening: **[`SERVER_HARDENING.md`](SERVER_HARDENING.md)**.
