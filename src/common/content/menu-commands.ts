/** Команды бота для BotFather / setMyCommands (описание до ~256 символов, без `/`). */
export const MENU_COMMANDS = {
  START: { command: 'start', description: 'Главное меню' },
  KEY: { command: 'key', description: 'Получить ключ' },
  HELP: { command: 'help', description: 'Инструкции' },
  SUPPORT: { command: 'support', description: 'Поддержка' },
  ADMIN: { command: 'admin', description: 'Админ: статус системы' },
} as const;

/** Порядок для вызова Telegram `setMyCommands` (совпадает с рекомендуемым списком в документации). */
export const DEFAULT_BOT_COMMANDS = [
  MENU_COMMANDS.START,
  MENU_COMMANDS.KEY,
  MENU_COMMANDS.HELP,
  MENU_COMMANDS.SUPPORT,
  MENU_COMMANDS.ADMIN,
] as const;
