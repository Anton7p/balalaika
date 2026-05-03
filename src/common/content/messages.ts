import { UI_LABELS } from './ui-labels';

export const MESSAGES = {
  MAIN_TITLE:
    '⚡️ Добро пожаловать в самый быстрый и стабильный VPN!\n\n' +
    '➖ Нам более года\n' +
    '➖ Высокая скорость\n' +
    '➖ Приватность\n' +
    '➖ Быстрая поддержка\n' +
    '➖ Поддержка ПК, Телефонов, Телевизоров!\n\n' +
    'VPN прямо в Telegram!\n\n' +
    '🎁 3 Дня бесплатной подписки ⬇️',

  SELECT_DURATION: 'Выберите срок подписки:',

  KEY_READY: (duration: string, key: string) =>
    `🔑 Ключ доступа (${duration})\n\n` + `\`\`\`\n${key}\n\`\`\``,

  EXTEND_SUCCESS: (newEndDate: string) =>
    `✅ Подписка продлена\n\n` +
    `Доступ активен до: ${newEndDate}\n\n` +
    `Ваш текущий ключ продолжает работать.`,

  MY_KEY_TITLE: '🧾 Ваш текущий ключ:',
  NO_KEY:
    `🧾 Мои ключи\n\nПока пусто. Перейдите в «${UI_LABELS.QUICK_START}», чтобы получить доступ.`,

  INSTRUCTIONS_TITLE: '🧭 Выберите платформу для настройки:',

  PLATFORM_TITLE: (platform: string) => `📱 ${platform}`,

  SUPPORT:
    '⚖️ Условия и поддержка\n\nНаши ресурсы:\n▬ FAQ и ответы на вопросы\n▬ Условия сервиса\n▬ Политика конфиденциальности',

  MY_KEYS_ACTIVE: (expiryDate: string, key: string) =>
    `🧾 Мои ключи\n\n` +
    `✅ Активная подписка до: ${expiryDate}\n\n` +
    `\`\`\`\n${key}\n\`\`\``,

  UNKNOWN_COMMAND: 'Неизвестная команда',
  ERROR: 'Ошибка. Попробуйте позже.',
  COPY_KEY_ERROR: '❌ Ошибка: ключ не найден',

  COPY_KEY_READY: (key: string) =>
    `📋 Ваш ключ:\n\n\`\`\`\n${key}\n\`\`\`\n\n✅ Нажмите на ключ выше, чтобы скопировать его`,
} as const;
