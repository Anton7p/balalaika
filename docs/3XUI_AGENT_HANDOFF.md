# Передача контекста агенту: 3x-ui v3.0.2, ноды, CI и ручные проверки

Этот файл — **что уже сделано**, **как диагностировали**, **где код**, **что осталось**. Подробные сценарии UI/API см. **`docs/3XUI_ANSIBLE_AND_NODES_RUNBOOK.md`**, инфраструктура SSH/секреты — **`docs/AGENT_INFRA.md`**.

---

## Цель задачи

- Поднять **панель (master)** и **две ноды** на **3x-ui v3.0.2**, зарегистрировать ноды на мастере, создать **по одному VLESS+REALITY inbound на ноду** (через API мастера с `nodeId`).
- Деплой через **GitHub Actions** (`deploy-3xui.yml`, `target=all`), при необходимости — локально через Ansible и **`.env`** (не в git).

---

## Хронология и симптомы

1. **403 на `POST …/panel/login`** (CI и скрипты): в v3 нужны **cookie сессии после CSRF**, **Referer / Origin / UA** на логине. Исправлено в **`ansible/3xui/tasks/include-panel-ui-session-bearer.yml`** (см. ранбук §1).

2. **Удалён `GET …/setting/getApiToken`** в v3.0.2+: токен API — список **`…/setting/apiTokens`** и при необходимости **`POST …/apiTokens/create`**. Логика в том же **`include-panel-ui-session-bearer.yml`**.

3. **Падение на создании per-node inbound** на мастере: Ansible **`uri`** к **`…/inbounds/add`** с `failed_when` по `json.success`; в логах CI изначально было **мало деталей** (`no_log: true`).

4. Разбор ответа панели: **`Something went wrong (POST panel/api/inbounds/add: HTTP 404)`** — это **не** JSON `success:false` с телом 97 байт как единственная причина; внутри 3x-ui **remote** ходит на ноду по пути **`panel/api/inbounds/add`** относительно **`basePath`** ноды в БД мастера. **HTTP 404** у панели v3 для API без сессии и без валидного Bearer при запросе **не** как `XMLHttpRequest` часто маскируется как **404** (см. `web/controller/api.go` → `checkAPIAuth`). Также **неверный `basePath`** (например `/` вместо `/panel/`) даёт запрос на **`/panel/api/...`** вместо **`/panel/panel/api/...`** и снова **NoRoute → 404**.

5. **Ручная проверка** (WSL + Ansible, инвентарь из `.env` по `ci/ci-write-inventory.yml`): с **мастера** на **node1** при токене, взятом **напрямую из sqlite БД ноды** (`/opt/infrastructure/panel/db/x-ui.db`, таблица `api_tokens`):
   - **`GET /panel/panel/api/inbounds/list`** + Bearer → **HTTP 200**;
   - **`POST /panel/panel/api/inbounds/add`** с **`Content-Type: application/x-www-form-urlencoded`** (как `web/runtime/remote.go` → `wireInbound`) → **HTTP 200**.  
   То есть **сеть мастер→нода и форма POST** на живой ноде **работают**; расхождение CI с высокой вероятностью — **запись ноды на мастере** (`api_token`, `base_path`) или **устаревший кэш remote** (в коде 3x-ui после `nodes/update` вызывается `InvalidateNode`, но первый кэш мог появиться при старых данных).

---

## Изменения в репозитории (куда смотреть)

| Область | Файлы |
|--------|--------|
| UI-сессия, API-токены v3.0.2+ | `ansible/3xui/tasks/include-panel-ui-session-bearer.yml` — в т.ч. **выбор последнего включённого токена по `id`** (не «первый в списке»). |
| Регистрация ноды, `basePath`, повторный sync | `ansible/3xui/tasks/nodes/50-register-on-master.yml` — **второй проход** `nodes/list` + снова `51-register…`; `51-register-one-node-on-master.yml` — **`allowPrivateAddress: true`**, **`apiToken \| trim`**, **`basePath` с trim**. |
| Пауза и probe перед reconcile | `ansible/3xui/tasks/nodes/52-per-node-inbounds-on-master.yml` — **pause 15s**, **`POST …/nodes/probe/:id`**. |
| Per-node inbound | `ansible/3xui/tasks/nodes/53-one-per-node-inbound.yml` — **`publicKey` в Reality**, явный **`tag` = remark**, **block/rescue** с выводом `msg`; create через **`uri`** JSON на **мастер**. |
| Локальный inbound на мастере | `ansible/3xui/tasks/panel/50-api-inbound.yml` — **`publicKey`** в Reality. |
| Диагностика в пайплайне | `ansible/3xui/deploy-nodes.yml` — play **`Verify node panel API from master host`**: с мастера **`GET …/inbounds/list`** на каждую ноду (в последнем CI этот шаг **проходил**, падение дальше на **`inbounds/add`** на мастере с `nodeId`). |
| Пин образа / дефолты | `ansible/3xui/defaults/main.yml` — образ **`ghcr.io/mhsanaei/3x-ui:v3.0.2`**. |
| Ручной повтор «как remote» | `ansible/adhoc-curl-node-from-master.yml` — чтение токена с **node1** из sqlite на диске, затем с **master** `curl` GET + POST form на ноду. **Не коммитить инвентарь с паролями**; после тестов удалять `inventory*.ini` с секретами. |

Документация, затронутая ранее в ветке: `docs/3XUI_ANSIBLE_AND_NODES_RUNBOOK.md`, `docs/AGENT_INFRA.md`, `docs/PANEL_*`, при необходимости синхронизировать ссылку на этот handoff из ранбука одной строкой (по желанию владельца репо).

---

## Команды для продолжения работы

**Инвентарь из `.env` (локально, WSL):**

```bash
cd /path/to/balalaika/ansible
export MASTER_IP='…'   # JSON как в AGENT_INFRA
export NODE_IPS='…'    # JSON-массив нод
export OUTPUT_PATH="$PWD/inventory.local.ini"
ansible-playbook -i localhost, ci/ci-write-inventory.yml
```

**Ручной curl-сценарий (мастер → нода), как выше:**

```bash
ansible-playbook -i inventory.local.ini adhoc-curl-node-from-master.yml
```

**CI:**

```bash
gh workflow run deploy-3xui.yml -f target=all
gh run list --workflow=deploy-3xui.yml --limit=5
gh run view <RUN_ID> --log-failed
```

Искать в логах: **`inbounds/add failed`**, **`HTTP 404`**, **`Verify node panel API`**.

---

## Что сделать следующему агенту (приоритет)

1. **Сверить токен на мастере с токеном на ноде** после плейбука: в БД мастера таблица нод (поле api token / base path) vs `api_tokens` на ноде. Если мастер хранит старый токен — обновление из Ansible должно проходить; если нет — дебажить **`nodes/update`** (тело JSON, GORM `Updates`).

2. **Повторить `adhoc-curl` для node2** и при падении CI — для IP из секретов CI (могут отличаться от локального `.env`).

3. Если GET с мастера OK, а **только** полный `inbounds/add` от панели падает: снять **`no_log`** временно на задаче create в **`53-one-per-node-inbound.yml`** в отдельной ветке или логировать только **`json.msg`** / HTTP status (без ключей Reality).

4. **Кэш `runtime.Manager.remotes`**: в исходниках 3x-ui при **`NodeService.Update`** вызывается **`InvalidateNode`**. Убедиться, что в CI действительно выполняется **update** (второй проход в `50-register-on-master.yml`) до **`52`**.

5. После зелёного CI: в UI мастера проверить **Nodes → online** и наличие **inbound** с нужным **remark** / **nodeId**.

---

## Важно (безопасность)

В ходе отладки агент мог использовать **локальный `.env`** с паролями и токенами. Рекомендация владельцу репозитория: при утечке контекста — **сменить пароли root/VPN**, **отозвать GitHub PAT**, **ротировать API-токены панели**. Не коммитить **`inventory*.ini`** с `ansible_password`.

---

## Ссылки на код 3x-ui (upstream), полезные при расследовании

- `web/runtime/remote.go` — **`wireInbound`** (form), **`do`**, URL = `baseURL() + "panel/api/…"`.
- `web/service/port_conflict.go` — **`resolveInboundTag`** / **`generateInboundTag`** (зачем явный **`tag`** при sync с нодой).
- `web/runtime/manager.go` — кэш **`remotes`**, **`InvalidateNode`**.
- `web/controller/api.go` — группа **`/panel/api`**, **`checkAPIAuth`**, 404 vs 401.

---

*Документ добавлен для непрерывности работы; дата по контексту сессии: май 2026.*
