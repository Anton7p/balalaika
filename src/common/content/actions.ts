/** Callback data (держите строки короткими — лимит Telegram 64 байта на callback_data). */
export const ACTIONS = {
  START_MENU: 'start_menu',
  BUY_MENU: 'buy_menu',
  MY_KEYS: 'my_keys',
  INSTRUCTIONS: 'instructions',
  LEGAL: 'legal',

  /** Алиас LEGAL: callback «условия» и маршрут SupportCommand */
  SUPPORT: 'legal',

  PLATFORM_IOS: 'platform_ios',
  PLATFORM_ANDROID: 'platform_android',
  PLATFORM_WINDOWS: 'platform_windows',
  PLATFORM_MACOS: 'platform_macos',

  FREE_TEST: 'free_test',
  MONTH_1: 'month_1',
  MONTH_3: 'month_3',

  /** Без payload: ключ брать из текста/caption сообщения или сессии (лимит callback_data). */
  COPY_KEY: 'copy_key',
} as const;

export type ActionCallbackValue = (typeof ACTIONS)[keyof typeof ACTIONS];
