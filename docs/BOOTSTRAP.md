# Bootstrap инфраструктуры (master и ноды)

Первичная подготовка хостов Ubuntu: сеть, Docker, SSH с ключом и hardening, на **master** — nginx и TLS для **`DOMAIN_NAME`**. Панель 3x-ui и приложение бота **не** ставятся этим плейбуком.

## Где в репозитории

| Что | Путь |
|-----|------|
| Плейбук | `ansible/bootstrap/bootstrap.yml` |
| Общие задачи | `ansible/bootstrap/tasks/common/` — `tcp-bbr.yml`, `docker.yml`, `ssh-key.yml`, `ssh-hardening.yml` |
| Master (TLS) | `ansible/bootstrap/tasks/master/nginx-certbot.yml` |
| CI: inventory | `ansible/ci/ci-write-inventory.yml` + шаблон `inventory.ci.ini.j2` (группы **`[master]`**, **`[nodes]`**) |

## Два этапа и маркер

Один файл-маркер на хост: **`/etc/<slug>-bootstrap.done`**, где **`<slug>`** нормализуется из **`DOMAIN_NAME`** (безопасные символы). Пока файл **есть** — соответствующие шаги на этом хосте **не повторяются**.

1. **Фаза 1 — `hosts: all`**  
   Если маркера нет: sysctl **BBR**, установка **Docker** и цепочка **DOCKER-USER**, **`SSH_PUBLIC_KEY`** в `authorized_keys`, **SSH hardening** + **UFW** (явные default deny/allow, OpenSSH, включение UFW).  
   Хосты из группы **`[nodes]`** (если не пустая) после фазы получают маркер с **`phase=system`** — для нод отдельного nginx нет.

2. **Фаза 2 — только `hosts: master`**  
   Нужен непустой **`DOMAIN_NAME`**: **nginx**, **certbot --nginx**, профиль UFW **Nginx Full**. Затем маркер с **`phase=full`**.

Подробнее про порты и фаервол: **[`SERVER_HARDENING.md`](SERVER_HARDENING.md)**.

## Секреты и переменные (CI)

Workflow **[`.github/workflows/bootstrap-infra.yml`](../.github/workflows/bootstrap-infra.yml)** (ручной запуск): **`MASTER_IP`**, **`DOMAIN_NAME`**, **`SSH_PUBLIC_KEY`**, **`SSH_PRIVATE_KEY`**, **`ANSIBLE_SSH_USERNAME=root`**. Перед плейбуком ставятся коллекции **`ansible.posix`**, **`community.general`**.

Локально: см. **[`AGENT_INFRA.md`](AGENT_INFRA.md)** — **`MASTER_IP`**, inventory, Ansible из WSL. Одним шагом (inventory + bootstrap + ping): **`bash scripts/deploy_bootstrap.sh`** из корня репозитория. Полный первый запуск (bootstrap, затем бот): **`bash scripts/deploy_bootstrap_then_bot.sh`** (см. **[`DEPLOY_BOT.md`](DEPLOY_BOT.md)** по переменным для бота и опции **`--build`**).

## Запуск вручную

Из каталога **`ansible/`** (ключ и при необходимости переменные в окружении):

```bash
ansible-playbook bootstrap/bootstrap.yml --private-key /path/to/id_ed25519
```

Перед этим соберите **`inventory.ini`** через **`ci/ci-write-inventory.yml`** с тем же **`MASTER_IP`**.
