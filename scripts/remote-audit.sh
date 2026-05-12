#!/usr/bin/env bash
# Запуск на удалённом хосте: ssh ... 'bash -s' < scripts/remote-audit.sh
set -e
echo "=== HOST ===" && hostname
echo "=== BOOTSTRAP MARKER ==="
shopt -s nullglob
for f in /etc/*-bootstrap.done; do
  echo "--- $f ---"
  cat "$f"
done
echo "=== BBR ===" && sysctl -n net.ipv4.tcp_congestion_control
echo "=== DOCKER ===" && systemctl is-active docker && docker --version
echo "=== UFW ===" && ufw status verbose
echo "=== LISTEN TCP ===" && ss -tlnp | head -40
echo "=== NGINX ===" && (nginx -v 2>&1 || true) && (systemctl is-active nginx 2>/dev/null || true)
echo "=== IPTABLES DOCKER-USER ===" && iptables -L DOCKER-USER -n -v 2>/dev/null | head -22 || echo "(no DOCKER-USER)"
echo "=== SSH (effective) ===" && (grep -rhE '^PermitRootLogin|^PasswordAuthentication' /etc/ssh/sshd_config /etc/ssh/sshd_config.d 2>/dev/null | grep -v '^#' | sort -u) || true
