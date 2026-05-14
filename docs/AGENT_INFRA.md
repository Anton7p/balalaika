# Контекст для агента: подключение к серверу

## SSH на master

- Пользователь: **`root`**.
- Секрет / переменная **`MASTER_IP`** — **всегда JSON-объект** с обязательными непустыми полями **`address`** (хост или IPv4 после нормализации плейбком) и **`password`** (root для `ansible_password`). Пример: `{"address":"203.0.113.10","password":"…"}`. В GitHub Actions это репозиторный секрет **`MASTER_IP`**. Локально для **`ci-write-inventory.yml`** задайте ту же переменную окружения **`MASTER_IP`**. Для SSH в терминале — **`root@<IP>`** или **`.env`** в корне (не в git).
- На сервере в **`authorized_keys`** должен быть ваш **публичный** ключ пары **`ssh-ed25519`** (как секрет **`SSH_PRIVATE_KEY`** в CI).

Команды агента Cursor выполняются **на вашем ПК**; до сервера «доходит» только ваш реально работающий SSH.

## Локальный Ansible (WSL)

Плейбуки рассчитаны на **Linux-контроллер** (пути, `ansible-playbook`). На Windows удобно вызывать Ansible из **WSL** в каталоге репозитория.

На WSL при проверке репозитория: **Python 3.12.3**, **`ansible-playbook` [core 2.20.4]** (`ansible-playbook --version`). У себя сверяйте `python3 --version` и `ansible-playbook --version`. Если Ansible не установлен: `sudo apt update && sudo apt install -y ansible` (или `pip install --user "ansible>=9"`).

### 3x-ui: второй play панели на `localhost`

Плейбук **`ansible/3xui/deploy-panel.yml`** после задач на **`master`** запускает play на **`localhost`**: HTTPS к **`DOMAIN_NAME`**, UI-login и REST (inbound). Удобно запускать из **WSL/Linux**, чтобы были **`python3`** или **`openssl`** для генерации shortId Reality; если их нет, используется встроенный **`lookup('password', …)`** Ansible (на чистом Windows без WSL первый шаг shell с **`/bin/bash`** уйдёт в fallback — см. задачи в **`tasks/panel/50-api-inbound.yml`**).

У **3x-ui v3** цепочка UI-сессии не «два независимых HTTP-запроса»: ответ **GET** `…/panel/csrf-token` выставляет **Set-Cookie**, и **POST** `…/panel/login` должен уйти с тем же **Cookie** (плюс **`X-CSRF-Token`**, **`Referer`**, **`Origin`**, **`User-Agent`**). Иначе панель отвечает **403**. В Ansible это поле **`cookies_string`** (и **`cookies`**) у первого **`ansible.builtin.uri`**, затем заголовок **`Cookie:`** на логине и объединённые cookie на **`getApiToken`** — см. **`ansible/3xui/tasks/include-panel-ui-session-bearer.yml`**. При необходимости подставьте браузерный UA через **`xui_panel_http_user_agent`** в **`ansible/3xui/defaults/main.yml`**.

Сбор **`inventory.ini`** из **`MASTER_IP`** (JSON в переменной окружения, не коммитить значение):

```bash
cd /path/to/balalaika/ansible
export MASTER_IP='{"address":"YOUR_IP","password":"YOUR_ROOT_PASSWORD"}'
ansible-playbook -i localhost, ci/ci-write-inventory.yml
```

Дальше, например, проверка доступа и синтаксис (ключ в файле, как в CI):

```bash
ansible master -i inventory.ini -m ping --private-key ~/.ssh/id_ed25519
ansible-playbook -i inventory.ini bot/deploy-app.yml --syntax-check
```

Тот же **`MASTER_IP`** и SSH-ключ подходят для **`bootstrap/bootstrap.yml`**, **`3xui/deploy-panel.yml`** и других плейбуков из этого репозитория — рабочая директория обычно **`ansible/`**, в корне репозитория лежат Dockerfile и приложение.

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

Закрытый набор имён секретов GitHub: **[`GITHUB_SECRETS.md`](GITHUB_SECRETS.md)**. REST API панели: **[`PANEL_REST_API.md`](PANEL_REST_API.md)**. Версия панели, master и ноды: **[`PANEL_MASTER_NODES.md`](PANEL_MASTER_NODES.md)**. Установка панели на master: **[`PANEL_INSTALL_MASTER.md`](PANEL_INSTALL_MASTER.md)**. Диагностика «нода Offline»: **[`PANEL_MASTER_NODES.md`](PANEL_MASTER_NODES.md#нода-в-ui-показывает-offline)**. Порты и hardening: **[`SERVER_HARDENING.md`](SERVER_HARDENING.md)**. Bootstrap: **[`BOOTSTRAP.md`](BOOTSTRAP.md)**. Деплой бота: **[`DEPLOY_BOT.md`](DEPLOY_BOT.md)**. Локальные скрипты: **`scripts/deploy_bootstrap.sh`**, **`scripts/deploy_bot.sh`**, **`scripts/deploy_3xui_panel.sh`**, **`scripts/deploy_3xui_nodes.sh`**, цепочка bootstrap→бот: **`scripts/deploy_bootstrap_then_bot.sh`**.
