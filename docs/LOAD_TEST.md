# Отчёт: нагрузочное и интеграционное тестирование Balalaika VPN

**Дата:** 2026-05-18  
**Статус:** сессия завершена; съёмный слой (`scripts/load-test/`, `scripts/test/`, `src/cli/`) **удалён из репозитория**.  
**Продакшен-код** (`src/vpn/*`, бот, watchdog) **не менялся** под тесты.

См. также: [`PRODUCT_STAGE.md`](PRODUCT_STAGE.md), [`VPN_OPERATING_MODEL.md`](VPN_OPERATING_MODEL.md) §6 (failover).

---

## 1. Цели

| Область | Что проверяли |
|---------|----------------|
| **Control plane** | 200 синтетических выдач на рабочую ноду, Postgres ↔ панель, Redis `working_index` |
| **Failover (prod-critical)** | `stop x-ui` на `NODE_IPS[0]` → watchdog → миграция на `NODE_IPS[1]` |
| **Data plane** | Реальный трафик Xray: sing-box + curl через ~200 VLESS-туннелей |
| **Capacity** | Ступени 50 → 100 → 197 туннелей + метрики ноды |
| **Resilience** | Краткий простой x-ui; restart `app` на master при активных туннелях |
| **Лимиты ОС** | `nf_conntrack`, `ulimit`, `ss` под нагрузкой |
| **Ротация по лимиту** | Смоук `VPN_INBOUND_CLIENT_LIMIT=2`, 3 выдачи → ожидание 2+1 на двух inbound |

Синтетические пользователи: `telegram_id = 9_000_000_000_000 + index` (CLI). В Telegram им **не доставляются** сообщения — для админ-уведомлений при failover ожидаемо **`Подписок обновлено: 0 / N`** (счётчик `notified`, не число записей в БД).

---

## 2. Стенд

| Роль | IP | Примечание |
|------|-----|------------|
| Master / панель | `62.60.229.227` | Postgres, app, 3x-ui, vpn-watchdog |
| Рабочая нода `[0]` | `109.172.95.82` | `NODE_IPS[0]` |
| Запасная `[1]` | `62.60.149.29` | `NODE_IPS[1]` |
| Генератор трафика | WSL + Docker на ПК | `LOAD_GENERATOR_IP` **не** использовался |

Переменные: `.env` — `MASTER_IP`, `NODE_IPS`, `DOMAIN_NAME`, `VPN_ADMIN_*`, `VPN_INBOUND_CLIENT_LIMIT=200` (кроме смоука ротации).

---

## 3. Съёмный слой (удалён)

Временно добавлено (уже **нет в репо**):

- **`scripts/load-test/`** — оркестратор `run-load-test.sh`: reset, seed, verify, export URI, traffic, capacity, resilience, node-limits, сценарии failover.
- **`src/cli/`** — NestJS CLI `issue-subscriptions`: выдача через `SubscriptionsService` без Telegraf.
- **`scripts/test/`** — ранние дубликаты (rotation-by-limit, clean-panel); позже перенесены в load-test.

Вспомогательно: Python (`panel_lib.py`, `clean-panel.py`, `export_uris.py`), sing-box + docker-compose для SOCKS (`TRAFFIC_BASE_PORT=21001` — порты 108xx заняты на Windows).

**Повтор прогона:** слой снят; для новых 200 выдач — бот/Telegram или отдельный одноразовый скрипт; после failover на master может не быть inbound для `[0]` — нужен `bash scripts/deploy_3xui_nodes.sh`.

---

## 4. Control plane — выдача 200

### 4.1 Первый прогон (утро)

| Шаг | Результат |
|-----|-----------|
| Seed 200 | **198 OK**, 2 ошибки (#101 duplicate email, #142 `getClientLinks`) |
| До failover | 198 подписок на inbound **1** (`109.172.95.82`) |
| Failover (ранний) | ~2.5 мин; watchdog `1 → 2`; Postgres **197** на inbound **2**, **1** на inbound **1** |
| Панель после | 198 клиентов на `balalaika-node-62-60-149-29` |

### 4.2 Основной прогон (вечер, после `deploy_3xui_nodes.sh`)

| Шаг | Результат |
|-----|-----------|
| `reset` | OK: панель + Postgres + Redis `working_index=0` |
| `deploy_3xui_nodes.sh` | Inbound для `109.172.95.82` создан (частичные WARN `Port already exists: 9443`) |
| `seed 200` | **200/200 OK**, `panelInboundId: 3` |
| `verify` | Postgres **200**; панель **197** клиентов на inbound 3 |
| `export-uris` | **197** URI; **3** ошибки (email/uuid не в settings inbound) |

**Расхождение 200 vs 197:** три подписки в БД без сопоставимого клиента в панели (тот же класс проблем, что duplicate / `getClientLinks`).

---

## 5. Failover (prod-critical) — **PASS**

**Сценарий:** `dead-node` (`docker compose stop x-ui` на `109.172.95.82`) → `wait-failover` → `verify-failover` → `restore`.

| Момент | Наблюдение |
|--------|------------|
| Старт | 200 подписок, `panel_inbound_id=3`, панель 197 клиентов |
| Ожидание | **~2.5 мин** (опрос Postgres каждые 15 s) |
| Postgres (PASS) | Сначала 127+73 на inbound 2 и 3; итог **197** на **2**, **3** на **3** |
| Панель | **197** на `balalaika-node-62-60-149-29` (inbound 2) |
| Redis после | `working_index=1`, `working_inbound_ids=2` |
| Watchdog | `inbound 3 check failed (1/3)→(3/3)` → `failover 3 (109.172.95.82) → 2 (62.60.149.29)` → `deleted dead inbound 3 on master` → `failover completed, app hook OK` |
| `restore` | x-ui на `109.172.95.82` снова **Up** |

**Вывод для продакшена:** контрольная плоскость при падении рабочей ноды отрабатывает: детект по 3 проверкам, миграция подписок, смена рабочей ноды в Redis, удаление мёртвого inbound с master. Восстановленный хост **не** становится primary автоматически.

**Побочные эффекты:** inbound рабочей ноды на master удалён watchdog; перед новым циклом 200 — `deploy_3xui_nodes.sh`. На стенде могли остаться «хвосты» (3 подписки на старом `panel_inbound_id`, старые клиенты на inbound 4 после частичных reset).

---

## 6. Data plane — трафик (sing-box + curl)

Генератор: Docker на WSL, SOCKS `21001–21197`, URL `https://proof.ovh.net/files/1Mb.dat` (~1 MB на успешный запрос).

| Прогон | Клиентов | Итог |
|--------|----------|------|
| Смоук | 10 | **9/9** туннелей OK |
| Средний | 50 | **49/49** стабильно |
| Полный + ramp | 197 | см. раунды |

**Раунды полного прогона (~10.4 min):**

| Раунд | req/туннель | OK | FAIL | ~трафик OK |
|-------|-------------|-----|------|------------|
| 1 | 1 | 150 | 46 | ~150 MB |
| 2 | 1 | 32 | 164 | ~32 MB |
| 3 | 1 | 18 | 178 | ~18 MB |
| 4 | 3 | 353 | 235 | ~353 MB |
| 5 | 5 | 675 | 305 | ~675 MB |
| 6 | 7 | **1372** | **0** | **~1.34 GB** |
| 7 | 11 | 802 | 1354 | ~802 MB |

- Сумма OK (раунды 1–7): ~**3400** запросов ≈ **~3.4 GB** через Xray на `109.172.95.82`.
- Пик (раунд 6): ~1.34 GB за ~70 s → порядка **~19 MB/s** суммарно на ноду.
- Финальная проверка туннелей: **192 OK**, **4 FAIL** (SOCKS).
- Раунды 1–3: прогрев WSL + одновременный старт 197 туннелей. Раунд 7: перегруз (~37% OK).

**Интерпретация:** 200 записей в панели ≠ 200 одновременных HD-потоков; пик ~19 MB/s ≈ 25–40 активных HD или ~80–100 лёгких потоков. Для MVP «до ~200 подключённых, умеренная активность» — **норма**; честный пик «все смотрят видео» — отдельный тест с **Linux VPS** (`LOAD_GENERATOR_IP`) и `iftop`/`top` на ноде.

---

## 7. Capacity (50 → 100 → 197)

Ступени с метриками ноды (CPU xray, `ss`, `/proc/net/dev`). Артефакт прогона: `capacity-20260518-211221/` (удалён вместе со слоем).

| Ступень | Туннели | Итог (из отчёта) |
|---------|---------|------------------|
| 50 | 50 | 49 OK |
| 100 | 100 | 99 OK |
| 197 | 197 | 196 OK, 2 раунда за 90 s |

---

## 8. Resilience

При **50** активных туннелях (`resilience-20260518-213527/`):

| Сценарий | Фаза | OK | FAIL | Вывод |
|----------|------|-----|------|--------|
| A: `stop x-ui` 30s | baseline | 196 | 0 | до остановки — норма |
| A | xui_down | 94 | **396** | трафик падает, ожидаемо |
| A | after_xui | 156 | 40 | восстановление не мгновенное |
| B: `restart app` | baseline + app_restart | 784 | **0** | **активные VPN-туннели не оборвались** |

---

## 9. Лимиты ОС на ноде

Прогон `node-limits-20260518-214147/` при 197 туннелях:

| Метрика | Значение | Запас |
|---------|----------|-------|
| `nf_conntrack_max` | 65536 | — |
| `nf_conntrack_count` (пик) | ~3405 | **~5%** от max |
| TCP (ss, пик) | ~95 | — |
| `ulimit -n` (shell) | 1024 | — |
| Трафик 197×2 req | **1176 OK / 0 FAIL** | лимиты ОС не упёрли |

`dmesg`: без `conntrack table full`.

---

## 10. Ротация по лимиту — **не завершена**

План: `VPN_INBOUND_CLIENT_LIMIT=2`, reset, 3 выдачи → Postgres **2+1** на двух inbound.

**Не довели до PASS:** после failover/частичного reset в панели остались старые клиенты (`Duplicate email: loadtest-9000000000000`); попытка `deploy_3xui_nodes.sh` после failover — известная ошибка панели `port` как string в JSON при `nodes/add` (Ansible); inbound на master восстанавливался вручную/частичным деплоем.

Для проверки ротации в будущем: чистый стенд + оба inbound на master + три ручные выдачи в боте при `VPN_INBOUND_CLIENT_LIMIT=2`.

---

## 11. Известные проблемы стенда / деплоя

| Проблема | Влияние |
|----------|---------|
| Watchdog удаляет inbound мёртвой ноды с master | Перед новым seed 200 — `deploy_3xui_nodes.sh` |
| `deploy_3xui_nodes.sh`: `nodes/add` / `inbounds/add` и `port` string vs int | Регистрация ноды `109.172.95.82` может падать; inbound иногда создаётся с WARN |
| WSL + Docker Desktop | Много FAIL на прогреве трафика; не репрезентативно для prod bandwidth |
| 3 подписки без клиента в панели | 200 в Postgres vs 197 в UI/export |
| После failover Redis указывает на standby | Восстановленная нода `[0]` не primary без отдельной политики |

---

## 12. Итоговые выводы

| Сценарий | Вердикт |
|----------|---------|
| Выдача 200 на одну ноду | **OK** (с оговоркой 197 в панели) |
| Failover 1+1 | **PASS** — главный результат для продакшена |
| Трафик / capacity | **OK** в рамках WSL; пик ~19 MB/s на ноду |
| Resilience restart app | **OK** — туннели живы |
| Resilience stop x-ui | Трафик падает; восстановление частичное за 30s |
| Лимиты ОС | **OK** — большой запас по conntrack |
| Ротация limit=2 | **Не прогоняли до конца** |
| Трафик с выделенного VPS | **Не делали** |

**Рекомендации после тестов:**

1. При необходимости чистого стенда: `scripts/clean-app-db-remote.sh` / UI панели + `deploy_3xui_nodes.sh` + проверить `VPN_INBOUND_CLIENT_LIMIT=200` в `.env` на master.
2. Пересобрать образ app (`deploy_bot.sh --build`) — в образе мог остаться `dist/cli/` от прошлой сборки; исходники CLI удалены.
3. Документировать в runbook: после auto-failover — redeploy inbounds, админ TG `0/N` на синтетике нормален.

---

## 13. Хронология сессии

1. Подготовка слоя load-test + CLI.  
2. reset → deploy-nodes → seed 200 → verify → export-uris.  
3. traffic (10 / 50 / 197+ramp), capacity, resilience, node-limits.  
4. failover: dead-node → wait ~2.5 min → verify → restore.  
5. Попытка rotation-by-limit (прервана состоянием панели).  
6. Снятие слоя: отчёт в этом файле, удаление `scripts/load-test/`, `scripts/test/`, `src/cli/`.

---

*Артефакты прогонов (`out/uris.jsonl`, `capacity-*`, `resilience-*`, `node-limits-*`) не хранились в git (gitignore) и удалены вместе со скриптами.*
