# 3x-ui: Ansible UI-логин, проверки на сервере, падение `inbounds/add` и `basePath` ноды

Сводка по расследованию (репозиторий balalaika; симптомы сверяли с **v3.0.1**, образ в Ansible — **v3.0.2**): что сломалось, что исправлено в коде, как проверить руками, отдельная проблема регистрации ноды на master.

---

## 1. UI-логин с контроллера (CSRF → login) и HTTP 403

### Симптом

- GitHub Actions и локальный **`scripts/deploy_3xui_panel.sh`** падали на задаче **«Log in to panel UI»**: **HTTP 403** на **`POST …/panel/login`**.
- **GET** **`…/panel/csrf-token`** при этом возвращал **200** и валидный CSRF.

### Причина

У **3x-ui v3** сессия UI не собирается из двух независимых HTTP-запросов без общей cookie:

1. **GET** **`/panel/csrf-token`** отдаёт **Set-Cookie** (сессия до логина).
2. **POST** **`/panel/login`** должен уйти **с тем же Cookie**, плюс **`X-CSRF-Token`**, и разумные **`Referer` / `Origin` / `User-Agent`**.

Иначе панель отвечает **403** (это не «неверный пароль» и не обязательно nginx по гео).

### Исправление в репозитории

Файл: **`ansible/3xui/tasks/include-panel-ui-session-bearer.yml`**

- После CSRF проверяется наличие **`cookies_string`** у ответа **`ansible.builtin.uri`**.
- На **POST login** в заголовки добавлены **`Cookie: "{{ xui_tpl_csrf_res.cookies_string }}"`**, **`Origin`**, **`Referer`**, **`User-Agent`**, **`Content-Type`**.
- Для **`getApiToken`** заголовок **Cookie** собирается из **`combine(csrf.cookies, login.cookies)`** через **`templates/common/cookie_header.j2`**.
- Опционально: **`xui_panel_http_user_agent`** в **`ansible/3xui/defaults/main.yml`** (если WAF режет не-браузерный UA).

Документация: **`docs/AGENT_INFRA.md`**, **`docs/PANEL_INSTALL_MASTER.md`**, **`docs/PANEL_REST_API.md`**.

---

## 2. Как проверить цепочку логина на сервере (вручную)

Плейбук второго play бьёт в **публичный HTTPS** с машины, где запущен Ansible (WSL / CI). На **самом master** панель слушает **`127.0.0.1:2053`** (см. **`xui_publish_host`** / **`xui_panel_http_port`**).

### С master по SSH (одна cookie-сессия)

Подставьте свой **`BASE`**, логин и пароль панели (как **`VPN_ADMIN_*`** в **`/opt/infrastructure/app/.env`** на master):

```bash
BASE="http://127.0.0.1:2053"
# или: BASE="https://<DOMAIN>"  — проверка через nginx/TLS

CJ=$(mktemp)
curl -sS -c "$CJ" -b "$CJ" -H 'Accept: application/json' \
  -H "Referer: ${BASE}/panel/" \
  "$BASE/panel/csrf-token" | jq -r .obj > /tmp/csrf.txt
CSRF=$(cat /tmp/csrf.txt)

curl -sS -c "$CJ" -b "$CJ" -X POST "$BASE/panel/login" \
  -H "Accept: application/json" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "X-Requested-With: XMLHttpRequest" \
  -H "X-CSRF-Token: $CSRF" \
  -H "Referer: ${BASE}/panel/" \
  -H "Origin: $BASE" \
  -H 'User-Agent: Mozilla/5.0' \
  --data-urlencode "username=ВАШ_ЛОГИН" \
  --data-urlencode "password=ВАШ_ПАРОЛЬ" | jq .

rm -f "$CJ" /tmp/csrf.txt
```

Ожидание: в JSON **`"success": true`**. Если убрать **`-c/-b`** со второго **`curl`**, снова можно получить **403** (как до фикса в Ansible).

### Простая проверка «жива ли панель»

Браузер: **`https://<DOMAIN>/panel/`** — форма входа.

### Проверка после Ansible

- **`bash scripts/deploy_3xui_panel.sh`** (WSL) или CI **Deploy 3x-ui** с **`target: panel`**: зелёные шаги **«Log in to panel UI»** и **«Read Bearer API token»** означают, что цепочка на контроллере прошла.

---

## 3. Где падал деплой нод: `inbounds/add`

### Симптом

- **`scripts/deploy_3xui_nodes.sh`** (или **`target: nodes` / `all`** в CI) падал на задаче **`Create VLESS+REALITY inbound on master bound to remote node`** в **`ansible/3xui/tasks/nodes/53-one-per-node-inbound.yml`**.
- HTTP **200**, но тело API: **`"success": false`**, сообщение вида:
  - **`Something went wrong (POST panel/api/inbounds/add: HTTP 404)`**

То есть **master** при создании inbound, привязанного к **nodeId**, проксирует запрос на **API ноды** и получает от ноды **404**.

---

## 4. Корневая причина 404: неверный `basePath` ноды на master

### Наблюдения на master (запрос **`/panel/panel/api/nodes/list`** с Bearer)

У ноды в списке оказались, в частности:

- **`"basePath": "/"`**
- **`"status": "offline"`**
- **`"lastError": "HTTP 404 from remote panel"`**

При этом с **того же master**:

- **`http://<NODE_IP>:2053/panel/csrf-token`** → **HTTP 200**

Значит, панель на ноде реально доступна по префиксу **`/panel/`**, а в записи ноды на master указан **`basePath: "/"`** — master строит неправильный URL к API ноды → **404** → падает **`inbounds/add`** и диагностика ноды показывает **offline**.

### Связь с Ansible

- **`ansible/3xui/tasks/nodes/50-register-on-master.yml`** при сборе **`xui_nodes_register`** задаёт **`basePath: "{{ xui_node_panel_base_path }}"`** (обычно **`/panel/`**), см. **`ansible/3xui/defaults/main.yml`** (**`xui_web_base_path`** / **`xui_node_panel_base_path`**).
- **`ansible/3xui/tasks/nodes/51-register-one-node-on-master.yml`** в теле **add/update** задаёт **`basePath: "{{ sync_node.basePath | default(xui_node_panel_base_path, true) }}"`** (не **`'/'`**).

Если на master уже была старая запись с **`basePath: "/"`**, один раз обновите ноду (**`deploy-nodes`** или UI), иначе RPC к ноде может оставаться сломанным до смены поля.

### Что править дальше (чеклист)

1. ~~В **`51-register-one-node-on-master.yml`** заменить дефолт **`'/'`** на **`xui_node_panel_base_path`**~~ — сделано: **`basePath: "{{ sync_node.basePath | default(xui_node_panel_base_path, true) }}"`** в **add** и **update**.
2. После смены плейбука — **обновить существующую ноду** на master (повторный прогон **`deploy-nodes`** или правка в UI), чтобы **`basePath`** стал **`/panel/`** (как **`webBasePath`** на самой ноде, см. **`20-admin-cli.yml`**).
3. Повторить **`deploy_3xui_nodes.sh`** и убедиться, что в **`nodes/list`** у ноды **`basePath`** совпадает с реальным **`webBasePath`**, **`lastError`** пустеет, **`inbounds/add`** проходит.

---

## 5. Прочее (лог контейнера)

В логах контейнера **`xui_app`** на master встречалась ошибка конфигурации **fail2ban** при старте (шаблон даты с **`%`**). На описанный выше **404 по RPC к ноде** это не указывает напрямую; при желании разобрать отдельно по логам Docker.

---

## 6. Быстрая навигация по файлам

| Тема | Файл |
|------|------|
| UI-сессия, cookie, CSRF | `ansible/3xui/tasks/include-panel-ui-session-bearer.yml` |
| Cookie-строка из dict | `ansible/3xui/templates/common/cookie_header.j2` |
| Inbound API на master (после логина) | `ansible/3xui/tasks/panel/50-api-inbound.yml` |
| Регистрация нод на master | `ansible/3xui/tasks/nodes/50-register-on-master.yml`, `51-register-one-node-on-master.yml` |
| Per-node inbound на master | `ansible/3xui/tasks/nodes/52-per-node-inbounds-on-master.yml`, `53-one-per-node-inbound.yml` |
| Дефолты путей/портов | `ansible/3xui/defaults/main.yml` |
| Локальный прогон панели | `scripts/deploy_3xui_panel.sh` |
| Локальный прогон нод | `scripts/deploy_3xui_nodes.sh` |

---

*Документ сформирован как внутренняя памятка по результатам ручных проверок на master и локальных прогонов Ansible; секреты и пароли в репозиторий не включать.*
