# 3x-ui: REST API панели (Dashboard)

В веб-интерфейсе разделы **Dashboard**, **Подключения**, **Узлы**, **Настройки**, **Настройки Xray**, **API Docs**, **Выход** относятся к одной панели. Программный доступ — через REST под префиксом **`panel/api/`** (ниже пути указаны относительно корня веб-приложения панели).

## Базовый URL и префикс

Публичный origin (например `https://vpn.example.com`) + **`webBasePath`** из настроек панели (часто **`/panel/`**). Сегмент API в цепочке пути — **`panel/api`**.

В коде этого репозитория URL собирается так: **`{origin}{webBasePath без завершающих `/`}/panel/api/…`** — при типичном `webBasePath=/panel/` получается префикс **`/panel/panel/api/`** перед ресурсом (например `…/panel/panel/api/inbounds/list`). Если у вас другой `webBasePath`, замените первый сегмент соответственно.

## Ответы

Почти все методы возвращают единый конверт **`{ success, msg, obj }`**, если не оговорено иное (`success` — булево, `msg` — текст, `obj` — полезная нагрузка).

## Аутентификация

Поддерживаются два режима.

1. **Сессия (как UI):** сначала **`GET {webBasePath}csrf-token`** — в JSON поле **`obj`** (строка CSRF), в ответе обычно **`Set-Cookie`** (сессия до логина). Затем **`POST {webBasePath}login`** (не под `panel/api/`) с тем же **`Cookie`**, заголовком **`X-CSRF-Token`**, типичными **`Referer` / `Origin` / `User-Agent`**; тело у веб-формы часто **`application/x-www-form-urlencoded`** (`username`, `password`; при 2FA — **`twoFactorCode`**). После успешного логина в ответе снова **`Set-Cookie`**; дальнейшие запросы UI/API с сессией идут с заголовком **`Cookie`**. В **3x-ui v3** запрос логина **без** cookie после CSRF часто даёт **403**. Для REST только с **Bearer API Token** cookie не нужны.
2. **API Token (программный доступ):** токен из **Настройки → Безопасность → API Token**. На каждый запрос: **`Authorization: Bearer <token>`** и **`Accept: application/json`**. Такие вызовы обходят CSRF и не требуют cookie-сессии. При смене/регенерации токена все клиенты должны получить новое значение.

Быстрый пример (только REST под `panel/api`):

```bash
curl -sS -X GET \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Accept: application/json" \
  "https://your-panel.example.com/panel/panel/api/inbounds/list"
```

(Подставьте свой реальный префикс пути вместо повторного `panel`, если `webBasePath` иной.)

---

## Authentication (сессия UI)

Маршруты **без** префикса `panel/api` — на том же базовом пути, что и веб-UI (после origin).

| Метод | Путь (относительно UI) | Описание |
|--------|-------------------------|----------|
| POST | `…/login` | Логин; cookie для последующих запросов. Обычно **`Cookie`** с шага **`csrf-token`** + **`X-CSRF-Token`**; тело чаще **form-urlencoded** (или JSON — зависит от клиента): `username`, `password`, `twoFactorCode` (если нужен OTP). |
| GET | `…/logout` | Сброс сессии; для не-браузерных клиентов обычно не нужен. |
| GET | `…/csrf-token` | CSRF для сессии (`obj` — строка). Bearer-клиенты CSRF не требуют. |
| POST | `…/getTwoFactorEnable` | Включена ли 2FA (`obj`: boolean) — для формы логина. |

## Inbounds API

Все маршруты под **`…/panel/api/inbounds`**. Нужна сессия или Bearer. Эндпоинты с ссылками учитывают **`X-Forwarded-Host`** / **`X-Forwarded-Proto`** за reverse proxy.

| Метод | Путь | Описание |
|--------|------|----------|
| GET | `/panel/api/inbounds/list` | Список inbound’ов пользователя с трафиком (`clientStats` и т.д.). |
| GET | `/panel/api/inbounds/get/:id` | Один inbound по числовому `id`. |
| GET | `/panel/api/inbounds/getClientTraffics/:email` | Счётчики трафика клиента по email. |
| GET | `/panel/api/inbounds/getClientTrafficsById/:id` | Счётчики по UUID/subId клиента. |
| POST | `/panel/api/inbounds/add` | Создать inbound (полный payload: `protocol`, `port`, JSON-строки `settings`, `streamSettings`, `sniffing`, `remark`, `expiryTime`, `total`, `enable`, …). |
| POST | `/panel/api/inbounds/del/:id` | Удалить inbound и связанную статистику клиентов. |
| POST | `/panel/api/inbounds/update/:id` | Полная замена конфигурации (как у `/add`). На больших inbound лучше `setEnable` только для вкл/выкл. |
| POST | `/panel/api/inbounds/setEnable/:id` | Только флаг `enable` (тело `{"enable": boolean}`). |
| POST | `/panel/api/inbounds/clientIps/:email` | Список IP, с которых заходили с учётными данными клиента (`"ip (timestamp)"`). |
| POST | `/panel/api/inbounds/clearClientIps/:email` | Сброс списка IP для клиента. |
| POST | `/panel/api/inbounds/addClient` | Добавить клиентов к inbound: тело с `id` (inbound) и `settings` — JSON массива `clients`. |
| POST | `/panel/api/inbounds/:id/copyClients` | Копировать клиентов между inbound: `sourceInboundId`, `clientEmails[]`, опционально `flow`. |
| POST | `/panel/api/inbounds/:id/delClient/:clientId` | Удалить клиента по UUID/password. |
| POST | `/panel/api/inbounds/updateClient/:clientId` | Обновить одного клиента без полной перезаписи inbound (тело с `id` и `settings` с нужным клиентом). |
| POST | `/panel/api/inbounds/:id/resetClientTraffic/:email` | Обнулить upload/download для клиента. |
| POST | `/panel/api/inbounds/resetAllTraffics` | Обнулить трафик на всех inbound (деструктивно). |
| POST | `/panel/api/inbounds/resetAllClientTraffics/:id` | Обнулить трафик всех клиентов одного inbound. |
| POST | `/panel/api/inbounds/delDepletedClients/:id` | Удалить исчерпавших по лимиту/сроку; `id=-1` — по всем inbound. |
| POST | `/panel/api/inbounds/import` | Массовый импорт (form, поле `data` — JSON inbound). |
| POST | `/panel/api/inbounds/onlines` | Email’ы клиентов «онлайн» (окно heartbeat). |
| POST | `/panel/api/inbounds/lastOnline` | Карта email → unix time последней активности. |
| GET | `/panel/api/inbounds/getSubLinks/:subId` | Массив URL подписки по `subId` (vless/vmess/…), без base64 как у `/sub/…`. |
| GET | `/panel/api/inbounds/getClientLinks/:id/:email` | URL(ы) как в кнопке «Copy URL» в UI. |
| POST | `/panel/api/inbounds/updateClientTraffic/:email` | Ручная подстройка счётчиков (`upload`, `download` в байтах). |
| POST | `/panel/api/inbounds/:id/delClientByEmail/:email` | Удалить клиента по email. |

Пример тела для **`/add`** (сокращённо): `enable`, `remark`, `listen`, `port`, `protocol`, `expiryTime`, `total`, строки JSON **`settings`**, **`streamSettings`**, **`sniffing`**.

---

## Server API

Под **`…/panel/api/server`** — статус хоста, логи, сертификаты, Xray, бэкап БД.

| Метод | Путь | Описание |
|--------|------|----------|
| GET | `/panel/api/server/status` | CPU, память, swap, диск, сеть, load, соединения, состояние Xray (кэш ~2 с). |
| GET | `/panel/api/server/cpuHistory/:bucket` | Устар.: история CPU; предпочтительнее `/history/cpu/:bucket`. |
| GET | `/panel/api/server/history/:metric/:bucket` | Временные ряды `{t, v}` за ~6 ч. `metric`: cpu, mem, swap, netIn, netOut, tcpCount, udpCount, load1, online. `bucket` ∈ 2, 30, 60, 120, 180, 300 (секунды). |
| GET | `/panel/api/server/getXrayVersion` | Доступные версии Xray для установки. |
| GET | `/panel/api/server/getPanelUpdateInfo` | Проверка обновления 3x-ui с GitHub. |
| GET | `/panel/api/server/getConfigJson` | Текущий собранный конфиг Xray. |
| GET | `/panel/api/server/getDb` | Скачать SQLite БД панели (attachment). |
| GET | `/panel/api/server/getNewUUID` | Новый UUID v4. |
| GET | `/panel/api/server/getNewX25519Cert` | Ключи Reality (X25519). |
| GET | `/panel/api/server/getNewmldsa65` | ML-DSA-65 (`privateKey`, `publicKey`, `seed`). |
| GET | `/panel/api/server/getNewmlkem768` | ML-KEM-768 (`clientKey`, `serverKey`). |
| GET | `/panel/api/server/getNewVlessEnc` | Ключевая пара VLESS encryption. |
| POST | `/panel/api/server/stopXrayService` | Остановить Xray. |
| POST | `/panel/api/server/restartXrayService` | Перезапуск Xray с текущим конфигом. |
| POST | `/panel/api/server/installXray/:version` | Установить версию Xray или `"latest"`. |
| POST | `/panel/api/server/updatePanel` | Self-update панели (перезапуск). |
| POST | `/panel/api/server/updateGeofile` | Обновить GeoIP/GeoSite (тело может содержать `fileName`). |
| POST | `/panel/api/server/updateGeofile/:fileName` | Обновить один файл (например `geoip.dat`). |
| POST | `/panel/api/server/logs/:count` | Последние строки лога панели (тело: `level`, `syslog`). |
| POST | `/panel/api/server/xraylogs/:count` | Последние строки лога Xray. |
| POST | `/panel/api/server/importDB` | Восстановление БД из multipart (`db`) — деструктивно, перезапуск. |
| POST | `/panel/api/server/getNewEchCert` | Новый ECH keypair (алгоритм в теле). |

---

## Nodes API

Удалённые панели-ноды. Префикс **`…/panel/api/nodes`**.

| Метод | Путь | Описание |
|--------|------|----------|
| GET | `/panel/api/nodes/list` | Список нод, здоровье, heartbeat. |
| GET | `/panel/api/nodes/get/:id` | Одна нода. |
| POST | `/panel/api/nodes/add` | Регистрация: `name`, `scheme`, `host`, `port`, `basePath`, `apiToken`, … |
| POST | `/panel/api/nodes/update/:id` | Замена данных подключения (тело как у `/add`). |
| POST | `/panel/api/nodes/del/:id` | Удалить ноду (inbound’ы не мигрируют автоматически). |
| POST | `/panel/api/nodes/setEnable/:id` | Вкл/выкл синхронизацию (`{"enable": boolean}`). |
| POST | `/panel/api/nodes/test` | Проверка соединения без сохранения (тело — параметры ноды). |
| POST | `/panel/api/nodes/probe/:id` | Проверка сохранённой ноды, обновление кэша здоровья. |
| GET | `/panel/api/nodes/history/:id/:metric/:bucket` | История метрик ноды (как у server/history). |

---

## Custom Geo API

Пользовательские источники GeoIP/GeoSite. Префикс **`…/panel/api/custom-geo`**.

| Метод | Путь | Описание |
|--------|------|----------|
| GET | `/panel/api/custom-geo/list` | Список источников, статус, время загрузки. |
| GET | `/panel/api/custom-geo/aliases` | Доступные алиасы для routing (встроенные + пользовательские). |
| POST | `/panel/api/custom-geo/add` | Добавить источник: `type` (например geoip), `alias`, `url` на `.dat`/`.json`. |
| POST | `/panel/api/custom-geo/update/:id` | Замена источника. |
| POST | `/panel/api/custom-geo/delete/:id` | Удалить источник и кэш. |
| POST | `/panel/api/custom-geo/download/:id` | Перекачать один источник. |
| POST | `/panel/api/custom-geo/update-all` | Перекачать все; ошибки по элементам в ответе. |

---

## Backup (Telegram)

| Метод | Путь | Описание |
|--------|------|----------|
| GET | `/panel/api/backuptotgbot` | Отправить свежий бэкап БД во все настроенные Telegram-чаты админов. Без тела и параметров. |

---

## Сводка по разделам UI

| Раздел панели | Типичное соответствие в API |
|----------------|-----------------------------|
| Dashboard / мониторинг | `server/status`, `server/history/…` |
| Подключения (inbounds, клиенты) | `inbounds/*` |
| Узлы | `nodes/*` |
| Настройки (общие) | часть логики вне `/panel/api` (классические form/JSON маршруты настроек панели — см. встроенную документацию версии) |
| Настройки Xray | `server/getConfigJson`, restart/install Xray, плюс UI-эндпоинты Xray в вашей сборке |
| API Docs | встроенная страница со спецификацией той же версии панели |
| Выход | `GET …/logout` |

Точное поведение и дополнительные маршруты могут отличаться по **версии 3x-ui**; при расхождениях ориентир — встроенная страница **API Documentation** на вашем деплое.
