# Контекст для агента: доступ к серверу и к панели

## Обязательно (чтобы не ломать правила и не уходить в тупик)

- **Автоматизация панели только через cookie после логина:** никаких **`GET …/csrf-token`**, **`GET …/panel/csrf-token`**, **`GET …/panel/panel/csrf-token`** и заголовка **`X-CSRF-Token`** в этом репозитории — см. раздел CSRF ниже. Не «улучшать» это по мотивам исходников upstream, пока на живом деплое не проверено иное.
- **Шаблон Xray (routing и всё остальное в одном JSON)** на нашем стенде уже меняется без CSRF: после **`POST …/login`** с тем же **`Cookie`** вызывать **`POST {origin}{webBasePath}panel/xray/`** (получить объект с **`xraySetting`** и **`outboundTestUrl`**), в памяти поправить JSON (например **`routing.rules`**), затем **`POST {origin}{webBasePath}panel/xray/update`** с телом **`application/x-www-form-urlencoded`**: поля **`xraySetting`** (строка — цельный JSON) и **`outboundTestUrl`**. При типичном **`webBasePath=/panel/`** это **`/panel/login`**, **`/panel/panel/xray/`**, **`/panel/panel/xray/update`** (на публичном домене — тот же суффикс пути после **`https://<DOMAIN>`**).
- **Не затирать шаблон:** всегда цикл **прочитали полный `xraySetting` → изменили нужное → записали целиком**, как для **`setting/all` → `setting/update`**.
- **Ansible в этом репозитории — без отдельных Python-скриптов:** не добавлять файлы `*.py` под деплой (в т.ч. в `ansible/playbooks/files/`, `ansible/scripts/`) и не копировать такие скрипты на целевые хосты для шагов панели/Xray. Логику выносить в **`*.yml` задачи**, Jinja и модули Ansible (`uri`, `set_fact`, `template`, …). Инвентарь для CI уже собирается плейбуком **`ansible/playbooks/ci-write-inventory.yml`** без хелперов на Python.
- Секреты и **`inventory.ini`** с паролями **не коммитить**.

## CSRF

**При любых обстоятельствах CSRF в этом репозитории не используется:** ни заголовка **`X-CSRF-Token`**, ни запросов за CSRF-токеном.

У панели upstream могут быть эндпоинты вида **`GET …/panel/csrf-token`** (до логина) и **`GET …/panel/panel/csrf-token`** (после логина, под тем же **`webBasePath`**). **Мы их не вызываем:** другие варианты «получить CSRF» для автоматизации **не нужны**.

Рабочая схема только такая: **`POST …/login`** → сохранить **cookie** сессии → все следующие запросы с заголовком **`Cookie`** (или тем же jar в **`curl`**). Новые правки не должны вводить CSRF в автоматизацию панели.

## SSH на master

- Пользователь: **`root`**.
- В GitHub Actions секрет **`SERVER_IP`** — **всегда JSON-объект** с обязательными непустыми полями **`address`** (хост или IPv4 после нормализации плейбком) и **`password`** (root для `ansible_password`). Пример: `{"address":"203.0.113.10","password":"…"}`. Локально для SSH агента можно использовать **`.env`** в корне (не в git) и обычный **`root@<IP>`** — это отдельно от контракта CI.
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

## Запрос cookie-сессии панели 3x-ui

После успешного логина панель выставляет cookie сессии; его нужно подставлять как заголовок **`Cookie`** в следующих запросах **или** сохранять файл jar для **`curl -b/-c`**.

При типичном **`webBasePath`** **`/panel/`** логин на loopback выглядит так (**`<webPort>`** — порт веб-панели на хосте, часто **2053**):

```bash
curl -sS -c /tmp/xui-cookies.txt -b /tmp/xui-cookies.txt \
  -X POST \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "Accept: application/json" \
  -H "X-Requested-With: XMLHttpRequest" \
  --data-urlencode "username=VPN_ADMIN_USERNAME" \
  --data-urlencode "password=VPN_ADMIN_PASSWORD" \
  http://127.0.0.1:<webPort>/panel/login
```

Подставьте учётные данные (**не светите** их и файл **`/tmp/xui-cookies.txt`** в чатах и в git). В теле ответа должен быть **`"success":true`**; cookie попадают в **`/tmp/xui-cookies.txt`**.

Дальше, например:

```bash
curl -sS -b /tmp/xui-cookies.txt -c /tmp/xui-cookies.txt \
  -X POST -H "Accept: application/json" \
  http://127.0.0.1:<webPort>/panel/panel/setting/all
```

Через TLS и домен путь тот же префикс, что в браузере (**`/panel/`** → логин **`…/panel/login`**, настройки **`…/panel/panel/setting/…`** — см. ваш **`webBasePath`** и версию панели).

Инвариант: **`/panel/csrf-token`** и **`/panel/panel/csrf-token`** не используем; только **cookies** после **`login`**. В этом репозитории **Ansible больше не деплоит панель** — автоматизацию панели делайте вручную (curl/скрипты) по тем же правилам.

## Метод «update» настроек: `POST …/panel/panel/setting/update`

В браузере это тот же запрос, что в DevTools (**например** `https://<DOMAIN>/panel/panel/setting/update`, метод **POST**, статус **200**): сервер сохраняет **целиком снимок настроек панели** из тела запроса в локальную БД 3x-ui (SQLite на томе панели). Это **не** обновление бинарника/образа Docker и **не** нажатие «обновить версию панели» в меню — только запись полей настроек.

**Как делать правильно (как UI и как Ansible):**

1. **`POST …/panel/panel/setting/all`** с тем же **`Cookie`** → в ответе объект **`obj`** со **всеми** полями.
2. В памяти (или в скрипте) изменить **только нужные** ключи в **`obj`**, остальное **оставить как пришло**.
3. **`POST …/panel/panel/setting/update`** с заголовком **`Cookie`**, **`Content-Type: application/json`**, телом — **весь изменённый объект** (как правило тот же состав полей, что вернул **`setting/all`**).

Без полного тела или с обрезанными полями панель может затереть недостающие значения defaults — поэтому цикл **all → правка → update** обязателен.

### Что означают поля из вашего примера (группы)

| Группа | Примеры полей | Смысл |
|--------|----------------|--------|
| Веб-панель | **`webListen`**, **`webDomain`**, **`webPort`**, **`webCertFile`**, **`webKeyFile`**, **`webBasePath`**, **`sessionMaxAge`** | Где и на каком порту слушает веб UI, TLS-файлы, базовый путь URL, время жизни сессии |
| Интерфейс списков | **`pageSize`**, **`expireDiff`**, **`trafficDiff`**, **`remarkModel`**, **`datepicker`** | Пагинация, пороги предупреждений, шаблон remark, календарь |
| Telegram панели | **`tgBotEnable`**, **`tgBotToken`**, **`tgBotChatId`**, **`tgRunTime`**, **`tgBotBackup`**, **`tgBotLoginNotify`**, **`tgCpu`**, **`tgLang`**, … | Встроенный бот уведомлений панели (не путать с токеном бота приложения) |
| Безопасность | **`timeLocation`**, **`twoFactorEnable`**, **`twoFactorToken`** | Часовой пояс, 2FA |
| Подписка | **`subEnable`**, **`subListen`**, **`subPort`**, **`subPath`**, **`subEncrypt`**, **`subURI`**, **`subEnableRouting`**, **`subRoutingRules`**, **`subJsonRules`**, **`subClashEnable`**, … | Сервер подписок, URI, JSON/Clash ветки |
| LDAP | **`ldapEnable`**, **`ldapHost`**, **`ldapBindDN`**, … | Синхронизация пользователей через LDAP |
| Прочее | **`restartXrayOnClientDisable`**, **`externalTrafficInformEnable`**, … | Поведение при отключении клиентов, внешние отчёты |

Поле **`xrayTemplateConfig`** (если есть в вашей сборке) — строка/JSON шаблона Xray по умолчанию; править только если понимаете эффект на конфиг.

### Как «обновить саму панель» (версию)

**`setting/update`** версию образа **не меняет**. Обновление образа **3x-ui** на master — вручную: **`docker compose pull`** и перезапуск стека в **`/opt/infrastructure/panel`** (если каталог у вас такой же). Внутри контейнера команды вида **`x-ui update`** для Docker-образа часто **не применимы** к вашей схеме установки.
