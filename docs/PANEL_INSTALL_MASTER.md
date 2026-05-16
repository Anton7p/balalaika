# Установка панели 3x-ui на master (Ansible)

Целевая версия — **v3.0.2** (см. [`PANEL_MASTER_NODES.md`](PANEL_MASTER_NODES.md)). Автоматизация в репозитории уже реализована: Docker Compose на master, nginx перед панелью, UFW, CLI-учётка, затем на **контроллере** (localhost play) — создание inbound по HTTPS API.

CI: workflow **[`deploy-3xui.yml`](../.github/workflows/deploy-3xui.yml)** с **`target: panel`** или **`all`**.

---

## Предварительно

1. **Bootstrap** на master: Docker, **nginx + certbot** под **`DOMAIN_NAME`**, SSH и ключи (см. [`BOOTSTRAP.md`](BOOTSTRAP.md), [`SERVER_HARDENING.md`](SERVER_HARDENING.md)).
2. Секреты **`DOMAIN_NAME`**, **`VPN_ADMIN_USERNAME`**, **`VPN_ADMIN_PASSWORD`**, **`MASTER_IP`**, **`SSH_PRIVATE_KEY`** (см. [`GITHUB_SECRETS.md`](GITHUB_SECRETS.md), [`AGENT_INFRA.md`](AGENT_INFRA.md)).

**Продукт:** публичный **`DOMAIN_NAME`** здесь — для **доступа к панели и для Ansible/CI** с контроллера по HTTPS. Пользовательские **`vless://`** по канонам репозитория строятся на **ноды**, см. **[`VPN_OPERATING_MODEL.md`](VPN_OPERATING_MODEL.md)**.

---

## Что делает Ansible

| Этап | Файл | Смысл |
|------|------|--------|
| Compose | [`ansible/3xui/tasks/panel/10-compose.yml`](../ansible/3xui/tasks/panel/10-compose.yml) | Каталог **`/opt/infrastructure/panel`**, образ **`xui_image`**, `docker compose up` |
| Админка CLI | [`20-admin-cli.yml`](../ansible/3xui/tasks/panel/20-admin-cli.yml) | `x-ui setting` — логин, пароль, **`webBasePath`** |
| Nginx | [`30-nginx.yml`](../ansible/3xui/tasks/panel/30-nginx.yml) + шаблон | Сниппет и `include` в vhost (по умолчанию **`xui_nginx_site_path`**) |
| UFW | [`40-ufw-inbound.yml`](../ansible/3xui/tasks/panel/40-ufw-inbound.yml) | Разрешить порт **`xui_inbound_port`** (VLESS) |
| Inbound API | [`50-api-inbound.yml`](../ansible/3xui/tasks/panel/50-api-inbound.yml) | Play на **`localhost`**: UI-login → Bearer → при отсутствии remark — VLESS+REALITY inbound (только если **`xui_create_default_local_inbound`**) |

Точка входа плейбука: [`ansible/3xui/deploy-panel.yml`](../ansible/3xui/deploy-panel.yml) (два play: **`master`**, затем **`localhost`**).

Общий сценарий **CSRF → login → Cookie** и дальнейшая UI-сессия (в т.ч. API-токены в **v3.0.2+**): [`ansible/3xui/tasks/include-panel-ui-session-bearer.yml`](../ansible/3xui/tasks/include-panel-ui-session-bearer.yml), шаблон Cookie: [`ansible/3xui/templates/common/cookie_header.j2`](../ansible/3xui/templates/common/cookie_header.j2). Для **v3** обязательно: **`Cookie`** с ответа **GET `/panel/csrf-token`** (в модуле **`uri`** это **`cookies_string`**) на **POST `/panel/login`**, плюс **`Referer` / `Origin` / `User-Agent`**; для последующих запросов с сессией в заголовок собираются cookie из ответов CSRF и логина (**`cookies`** объединяются через **`combine`**).

Пины образа и портов: [`ansible/3xui/defaults/main.yml`](../ansible/3xui/defaults/main.yml).

---

## Контроллер для второго play (`localhost`)

Плей **Configure panel inbound via public HTTPS API** выполняется на машине, где запущен `ansible-playbook` (CI или WSL). Для генерации **shortId** Reality: сначала **`python3`** или **`openssl`**, иначе **`lookup('password', …)`** (см. [`AGENT_INFRA.md`](AGENT_INFRA.md) — рекомендация WSL/Linux).

---

## Проверка

Снаружи: **`https://DOMAIN_NAME`**, вход в панель. Inbound с **`xui_inbound_remark`** в списке inbounds. REST: [`PANEL_REST_API.md`](PANEL_REST_API.md).

---

## Обновление

Повторный **`deploy-3xui`** с **`target: panel`**: `compose pull/up`, правки nginx при изменении шаблонов, повторный прогон API-задачи идемпотентен по remark inbound.
