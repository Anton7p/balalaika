export const ADMIN_MESSAGES = {
  FORBIDDEN: 'Эта команда доступна только администратору.',
  STATUS_TITLE: '🛠️ Статус системы',
  STATUS_APP: (status: string) => `Приложение: ${status}`,
  STATUS_NODES_EMPTY: 'Ноды VPN не зарегистрированы.',
  STATUS_NODES_ERROR: 'Ноды VPN: ошибка запроса',
  STATUS_NODE_LINE: (name: string, status: string, address: string) =>
    `• ${name} — ${status} (${address})`,
} as const;
