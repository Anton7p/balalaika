export interface LegalLink {
  readonly name: string;
  readonly url: string;
}

/** Только подписи кнопок; URL — `ContentLinksService` (`LEGAL_SITE_PATHS` + `DOMAIN_NAME` или env). */
export const LEGAL_LINK_DISPLAY_NAMES = {
  FAQ: '🧠 FAQ и ответы',
  TERMS: '📄 Условия сервиса',
  PRIVACY: '📄 Политика конфиденциальности',
} as const;

export type LegalLinkKey = keyof typeof LEGAL_LINK_DISPLAY_NAMES;
