import type { LegalLinkKey } from './legal-links';
import type { PlatformGuideKey } from './platform-guides';

/**
 * Пути на основном домене бота: полный URL = `https://<DOMAIN_NAME>` + путь.
 * Здесь правятся «боевые» ссылки по умолчанию; точечный override — через env
 * `LEGAL_*_URL` и `PLATFORM_GUIDE_*_URL` в `ContentLinksService`.
 */
export const LEGAL_SITE_PATHS: Record<LegalLinkKey, string> = {
  FAQ: '/faq',
  TERMS: '/terms',
  PRIVACY: '/privacy',
};

export const PLATFORM_GUIDE_SITE_PATHS: Record<PlatformGuideKey, string> = {
  IOS: '/guide/ios',
  ANDROID: '/guide/android',
  WINDOWS: '/guide/windows',
  MACOS: '/guide/macos',
};
