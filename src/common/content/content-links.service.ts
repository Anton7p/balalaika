import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LegalLink } from './legal-links';
import {
  LEGAL_LINK_DISPLAY_NAMES,
  type LegalLinkKey,
} from './legal-links';
import type { PlatformGuidesBundle, PlatformGuideKey } from './platform-guides';

const LEGAL_URL_ENV: Record<LegalLinkKey, string> = {
  FAQ: 'LEGAL_FAQ_URL',
  TERMS: 'LEGAL_TERMS_URL',
  PRIVACY: 'LEGAL_PRIVACY_URL',
};

const LEGAL_DEFAULT_URL: Record<LegalLinkKey, string> = {
  FAQ: 'https://example.com/faq',
  TERMS: 'https://example.com/terms',
  PRIVACY: 'https://example.com/privacy',
};

const PLATFORM_URL_ENV: Record<PlatformGuideKey, string> = {
  IOS: 'PLATFORM_GUIDE_IOS_URL',
  ANDROID: 'PLATFORM_GUIDE_ANDROID_URL',
  WINDOWS: 'PLATFORM_GUIDE_WINDOWS_URL',
  MACOS: 'PLATFORM_GUIDE_MACOS_URL',
};

const PLATFORM_DEFAULT_URL: PlatformGuidesBundle = {
  IOS: 'https://example.com/guide/ios',
  ANDROID: 'https://example.com/guide/android',
  WINDOWS: 'https://example.com/guide/windows',
  MACOS: 'https://example.com/guide/macos',
};

/** Юридические и гайд-ссылки из конфигурации окружения (white-label). */
@Injectable()
export class ContentLinksService {
  constructor(private readonly config: ConfigService) {}

  getLegalLinks(): Record<LegalLinkKey, LegalLink> {
    const keys: LegalLinkKey[] = ['FAQ', 'TERMS', 'PRIVACY'];
    const result = {} as Record<LegalLinkKey, LegalLink>;
    for (const key of keys) {
      const raw = this.config.get<string>(LEGAL_URL_ENV[key]);
      const url =
        raw !== undefined && raw.length > 0 ? raw : LEGAL_DEFAULT_URL[key];
      result[key] = {
        name: LEGAL_LINK_DISPLAY_NAMES[key],
        url,
      };
    }
    return result;
  }

  getPlatformGuides(): PlatformGuidesBundle {
    const keys: PlatformGuideKey[] = [
      'IOS',
      'ANDROID',
      'WINDOWS',
      'MACOS',
    ];
    const out: PlatformGuidesBundle = { ...PLATFORM_DEFAULT_URL };
    for (const key of keys) {
      const raw = this.config.get<string>(PLATFORM_URL_ENV[key]);
      if (raw !== undefined && raw.length > 0) {
        out[key] = raw;
      }
    }
    return out;
  }
}
